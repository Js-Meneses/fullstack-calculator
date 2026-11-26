import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculate } from './client'
import type { CalculationRequest } from './types'

const ADD: CalculationRequest = { operation: 'add', operands: [2, 3] }

function respond(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function respondJson(status: number, body: unknown) {
  return respond(status, JSON.stringify(body))
}

// A fetch that never answers, and rejects like the real one when aborted.
function hang() {
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
})

describe('calculate', () => {
  it('sends a JSON POST to the calculations endpoint', async () => {
    const fetchMock = respondJson(200, { result: 5 })

    await calculate({ operation: 'sqrt', operands: [9] })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/calculations')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"operation":"sqrt","operands":[9]}')
  })

  it('returns aborted without calling fetch when the signal is already aborted', async () => {
    const fetchMock = respondJson(200, { result: 5 })
    const controller = new AbortController()
    controller.abort()

    expect(await calculate(ADD, controller.signal)).toEqual({ kind: 'aborted' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns aborted when the signal is aborted mid-flight', async () => {
    hang()
    const controller = new AbortController()

    const outcome = calculate(ADD, controller.signal)
    controller.abort()

    expect(await outcome).toEqual({ kind: 'aborted' })
  })

  it('returns aborted when the signal is aborted while the body is read', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort()
        return new Response('{"result":5}', { status: 200 })
      }),
    )

    expect(await calculate(ADD, controller.signal)).toEqual({ kind: 'aborted' })
  })

  it('returns network-error when no response arrives within 10 s', async () => {
    vi.useFakeTimers()
    const fetchMock = hang()
    let settled = false

    const outcome = calculate(ADD).then((value) => {
      settled = true
      return value
    })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await outcome).toEqual({ kind: 'network-error' })
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal?.aborted).toBe(true)
  })

  it('returns network-error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    expect(await calculate(ADD)).toEqual({ kind: 'network-error' })
  })

  it('returns network-error when reading the body fails', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'))
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))

    expect(await calculate(ADD)).toEqual({ kind: 'network-error' })
  })

  it('returns success with the result of a 200 response', async () => {
    respondJson(200, { result: 0.30000000000000004 })

    expect(await calculate(ADD)).toEqual({ kind: 'success', result: 0.30000000000000004 })
  })

  it('returns api-error with a known code', async () => {
    respondJson(422, {
      error: { code: 'division_by_zero', message: 'Division by zero is not allowed.' },
    })

    expect(await calculate({ operation: 'divide', operands: [1, 0] })).toEqual({
      kind: 'api-error',
      code: 'division_by_zero',
    })
  })

  it.each([
    ['a plain-text 500', 500, 'Internal Server Error'],
    ['a 200 with a body of the wrong shape', 200, '{"value":5}'],
    ['a 200 with a string result', 200, '{"result":"5"}'],
    ['a 200 with an array body', 200, '[5]'],
    ['a 200 with a non-finite result', 200, '{"result":1e400}'],
    ['an error with an unknown code', 422, '{"error":{"code":"teapot","message":"x"}}'],
    ['an error with an inherited property as code', 400, '{"error":{"code":"toString"}}'],
    ['an error body of the wrong shape', 400, '{"error":"invalid_json"}'],
  ])('returns network-error for %s', async (_name, status, body) => {
    respond(status, body)

    expect(await calculate(ADD)).toEqual({ kind: 'network-error' })
  })
})
