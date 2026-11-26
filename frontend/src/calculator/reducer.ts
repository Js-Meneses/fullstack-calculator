import type {
  BinaryOperation,
  CalculationOutcome,
  CalculationRequest,
} from '../api/types'
import { formatNumber } from './format'
import { ERROR_MESSAGES, type ErrorReason } from './messages'

type Input = { kind: 'entry'; text: string } | { kind: 'value'; value: number }

type FollowUp =
  | { kind: 'chain'; operator: BinaryOperation }
  | { kind: 'equals' }
  | { kind: 'sqrt' }

export type State = {
  accumulator: number | null // left operand; set exactly when operator is set
  operator: BinaryOperation | null // pending binary operator
  input: Input | null // null only right after an operator key
  pending: { id: number; request: CalculationRequest; followUp: FollowUp } | null
  error: ErrorReason | null
  nextId: number
}

export type UserAction =
  | { type: 'digit'; digit: string } // '0' to '9'
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'operator'; operator: BinaryOperation }
  | { type: 'sqrt' }
  | { type: 'equals' }
  | { type: 'clear' }

export type Action =
  | UserAction
  | { type: 'response'; id: number; outcome: CalculationOutcome }

type KeyAction = Exclude<UserAction, { type: 'clear' }>

export type View = {
  main: string
  expression: string
  isError: boolean
  busy: boolean
  pressedOperator: BinaryOperation | null
}

const MAX_DIGITS = 12

const OPERATOR_SYMBOLS: Record<BinaryOperation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percentage: '%',
}

export const initialState: State = {
  accumulator: null,
  operator: null,
  input: { kind: 'entry', text: '0' },
  pending: null,
  error: null,
  nextId: 0,
}

export function reducer(state: State, action: Action): State {
  if (action.type === 'response') {
    return receive(state, action.id, action.outcome)
  }
  if (action.type === 'clear') {
    return reset(state)
  }
  if (state.pending !== null) {
    return state
  }
  if (state.error !== null) {
    return recover(state, action)
  }
  return press(state, action)
}

export function selectView(state: State): View {
  return {
    main: mainLine(state),
    expression:
      state.operator === null
        ? ''
        : `${formatNumber(state.accumulator!)} ${OPERATOR_SYMBOLS[state.operator]}`,
    isError: state.error !== null,
    busy: state.pending !== null,
    pressedOperator: state.operator,
  }
}

// The initial state, keeping nextId so that a request id is never reused.
function reset(state: State): State {
  return { ...initialState, nextId: state.nextId }
}

function recover(state: State, action: KeyAction): State {
  switch (action.type) {
    case 'digit':
    case 'decimal':
      return press(reset(state), action)
    case 'backspace':
      return reset(state)
    default:
      return state
  }
}

function press(state: State, action: KeyAction): State {
  const { input } = state
  switch (action.type) {
    case 'digit':
      return withEntry(
        state,
        input?.kind === 'entry' ? appendDigit(input.text, action.digit) : action.digit,
      )
    case 'decimal':
      return withEntry(state, input?.kind === 'entry' ? appendDecimal(input.text) : '0.')
    case 'toggleSign':
      if (input?.kind === 'entry') {
        return withEntry(state, toggleEntrySign(input.text))
      }
      return { ...state, input: { kind: 'value', value: negate(displayedNumber(state)) } }
    case 'backspace':
      return input?.kind === 'entry' ? withEntry(state, deleteLast(input.text)) : state
    case 'operator':
      if (state.operator === null) {
        return {
          ...state,
          accumulator: displayedNumber(state),
          operator: action.operator,
          input: null,
        }
      }
      if (input === null) {
        return { ...state, operator: action.operator }
      }
      return request(state, binaryRequest(state), { kind: 'chain', operator: action.operator })
    case 'sqrt':
      return request(
        state,
        { operation: 'sqrt', operands: [displayedNumber(state)] },
        { kind: 'sqrt' },
      )
    case 'equals':
      if (state.operator === null || input === null) {
        return state
      }
      return request(state, binaryRequest(state), { kind: 'equals' })
  }
}

function receive(state: State, id: number, outcome: CalculationOutcome): State {
  const { pending } = state
  if (pending === null || pending.id !== id) {
    return state
  }
  switch (outcome.kind) {
    case 'success':
      return applyResult({ ...state, pending: null }, pending.followUp, outcome.result)
    case 'api-error':
      return { ...reset(state), error: outcome.code }
    case 'network-error':
      return { ...reset(state), error: 'network' }
    case 'aborted':
      return { ...state, pending: null }
  }
}

function applyResult(state: State, followUp: FollowUp, result: number): State {
  switch (followUp.kind) {
    case 'chain':
      return { ...state, accumulator: result, operator: followUp.operator, input: null }
    case 'equals':
      return {
        ...state,
        accumulator: null,
        operator: null,
        input: { kind: 'value', value: result },
      }
    case 'sqrt':
      return { ...state, input: { kind: 'value', value: result } }
  }
}

function request(
  state: State,
  calculation: CalculationRequest,
  followUp: FollowUp,
): State {
  return {
    ...state,
    pending: { id: state.nextId, request: calculation, followUp },
    nextId: state.nextId + 1,
  }
}

// Only called with an operator set, which means the accumulator is set too.
function binaryRequest(state: State): CalculationRequest {
  return {
    operation: state.operator!,
    operands: [state.accumulator!, displayedNumber(state)],
  }
}

function displayedNumber({ input, accumulator }: State): number {
  if (input === null) {
    return accumulator!
  }
  return input.kind === 'entry' ? Number(input.text) : input.value
}

function mainLine(state: State): string {
  if (state.error !== null) {
    return ERROR_MESSAGES[state.error]
  }
  if (state.input?.kind === 'entry') {
    return state.input.text
  }
  return formatNumber(displayedNumber(state))
}

function withEntry(state: State, text: string): State {
  return { ...state, input: { kind: 'entry', text } }
}

function countDigits(text: string): number {
  return text.replace(/[^0-9]/g, '').length
}

function appendDigit(text: string, digit: string): string {
  if (countDigits(text) >= MAX_DIGITS) {
    return text
  }
  if (text === '0') {
    return digit
  }
  if (text === '-0') {
    return `-${digit}`
  }
  return text + digit
}

function appendDecimal(text: string): string {
  return text.includes('.') || countDigits(text) >= MAX_DIGITS ? text : `${text}.`
}

function deleteLast(text: string): string {
  const rest = text.slice(0, -1)
  return rest === '' || rest === '-' ? '0' : rest
}

function toggleEntrySign(text: string): string {
  return text.startsWith('-') ? text.slice(1) : `-${text}`
}

// Negation is exact. A zero stays 0 rather than becoming -0.
function negate(value: number): number {
  return value === 0 ? 0 : -value
}
