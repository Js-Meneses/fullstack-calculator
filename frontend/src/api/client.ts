import type {
  ApiErrorCode,
  CalculationOutcome,
  CalculationRequest,
} from './types'

const ENDPOINT = '/api/v1/calculations'
const TIMEOUT_MS = 10_000

// A Record, so a code added to ApiErrorCode but not here fails the build.
const API_ERROR_CODES: Record<ApiErrorCode, true> = {
  invalid_json: true,
  invalid_request: true,
  unknown_operation: true,
  invalid_operand_count: true,
  not_found: true,
  method_not_allowed: true,
  body_too_large: true,
  unsupported_media_type: true,
  division_by_zero: true,
  negative_square_root: true,
  result_out_of_range: true,
  undefined_result: true,
  internal_error: true,
}

const NETWORK_ERROR: CalculationOutcome = { kind: 'network-error' }
const ABORTED: CalculationOutcome = { kind: 'aborted' }

/**
 * Sends one calculation to the API. The promise never rejects: every failure
 * is one of the outcome kinds.
 */
export async function calculate(
  request: CalculationRequest,
  signal?: AbortSignal,
): Promise<CalculationOutcome> {
  if (signal?.aborted) {
    return ABORTED
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, TIMEOUT_MS)
  signal?.addEventListener('abort', abort)

  try {
    const outcome = await send(request, controller.signal)
    return signal?.aborted ? ABORTED : outcome
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function send(
  request: CalculationRequest,
  signal: AbortSignal,
): Promise<CalculationOutcome> {
  let status: number
  let text: string
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    status = response.status
    text = await response.text()
  } catch {
    return NETWORK_ERROR
  }
  return interpret(status, parseJson(text))
}

function interpret(status: number, body: unknown): CalculationOutcome {
  if (status === 200) {
    if (isObject(body) && typeof body.result === 'number' && Number.isFinite(body.result)) {
      return { kind: 'success', result: body.result }
    }
    return NETWORK_ERROR
  }
  if (isObject(body) && isObject(body.error) && isApiErrorCode(body.error.code)) {
    return { kind: 'api-error', code: body.error.code }
  }
  return NETWORK_ERROR
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(API_ERROR_CODES, value)
}
