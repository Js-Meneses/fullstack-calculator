import { describe, expect, it } from 'vitest'
import type { BinaryOperation, CalculationOutcome, CalculationRequest } from '../api/types'
import {
  initialState,
  reducer,
  selectView,
  type State,
  type UserAction,
} from './reducer'

// Key legend for these tests: digits, '.', n = ±, b = backspace,
// + - * / ^ % = the binary operators, r = √, '=' equals, c = clear.
const KEYS: Record<string, UserAction> = {
  '.': { type: 'decimal' },
  n: { type: 'toggleSign' },
  b: { type: 'backspace' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'operator', operator: 'percentage' },
  r: { type: 'sqrt' },
  '=': { type: 'equals' },
  c: { type: 'clear' },
}

function toAction(key: string): UserAction {
  return /^[0-9]$/.test(key) ? { type: 'digit', digit: key } : KEYS[key]
}

function keys(sequence: string, from: State = initialState): State {
  return [...sequence].reduce((state, key) => reducer(state, toAction(key)), from)
}

function answer(state: State, outcome: CalculationOutcome): State {
  return reducer(state, { type: 'response', id: state.pending!.id, outcome })
}

function ok(result: number): CalculationOutcome {
  return { kind: 'success', result }
}

function main(state: State): string {
  return selectView(state).main
}

const DIVISION_BY_ZERO: CalculationOutcome = { kind: 'api-error', code: 'division_by_zero' }

// input `entry` 12, no operator
const entryState = (): State => keys('12')
// input `value` 3, no operator
const valueState = (): State => answer(keys('9r'), ok(3))
// accumulator 2, operator add, input null
const operatorState = (): State => keys('2+')
// error division_by_zero, nextId 1
const errorState = (): State => answer(keys('1/0='), DIVISION_BY_ZERO)
// add [2,3] pending, follow-up equals
const pendingState = (): State => keys('2+3=')

describe('initial state', () => {
  it('shows 0 with no expression', () => {
    expect(selectView(initialState)).toEqual({
      main: '0',
      expression: '',
      isError: false,
      busy: false,
      pressedOperator: null,
    })
  })
})

describe('entry rules', () => {
  it('ignores a digit once the entry has 12 digits', () => {
    expect(main(keys('1234567890123'))).toBe('123456789012')
  })

  it('counts the 0 of 0.5 towards the limit', () => {
    expect(main(keys('0.123456789012'))).toBe('0.12345678901')
  })

  it('does not count the sign or the point', () => {
    expect(main(keys('1234567890.12n'))).toBe('-1234567890.12')
  })

  it('replaces an entry of 0 with the digit', () => {
    expect(main(keys('05'))).toBe('5')
    expect(main(keys('00'))).toBe('0')
  })

  it('turns -0 into minus the digit', () => {
    expect(main(keys('n5'))).toBe('-5')
  })

  it('allows zeros after the point', () => {
    expect(main(keys('0.0'))).toBe('0.0')
    expect(main(keys('0.05'))).toBe('0.05')
  })

  it('ignores a second decimal point', () => {
    expect(main(keys('1.2.3'))).toBe('1.23')
  })

  it('ignores the decimal point once the entry has 12 digits', () => {
    expect(main(keys('123456789012.'))).toBe('123456789012')
  })

  it('removes the last character on backspace', () => {
    expect(main(keys('123b'))).toBe('12')
    expect(main(keys('1.b'))).toBe('1')
    expect(main(keys('1.5b'))).toBe('1.')
  })

  it('turns an entry that becomes empty or "-" into 0', () => {
    expect(main(keys('5b'))).toBe('0')
    expect(main(keys('b'))).toBe('0')
    expect(main(keys('5nb'))).toBe('0')
    expect(main(keys('12nb'))).toBe('-1')
    expect(main(keys('nb'))).toBe('0')
  })

  it('reaches 14 characters at most', () => {
    expect(main(keys('0.12345678901n'))).toHaveLength(14)
    expect(main(keys('1234567890.12n'))).toHaveLength(14)
  })

  it('formats the entry in the expression line', () => {
    expect(selectView(keys('12.500+')).expression).toBe('12.5 +')
    expect(selectView(keys('7.+')).expression).toBe('7 +')
    expect(selectView(keys('0.0000001+')).expression).toBe('1e-7 +')
    expect(selectView(keys('123456789012+')).expression).toBe('123456789012 +')
  })
})

describe('digit', () => {
  it('starts a new entry after an operator', () => {
    const state = keys('3', operatorState())
    expect(main(state)).toBe('3')
    expect(selectView(state).expression).toBe('2 +')
  })

  it('starts a new entry after a value', () => {
    expect(main(keys('4', valueState()))).toBe('4')
  })

  it('appends to an entry', () => {
    expect(main(keys('3', entryState()))).toBe('123')
  })

  it('recovers from an error with a new entry', () => {
    expect(keys('7', errorState())).toEqual({
      ...initialState,
      input: { kind: 'entry', text: '7' },
      nextId: 1,
    })
  })
})

describe('decimal', () => {
  it('starts 0. after an operator', () => {
    expect(main(keys('.', operatorState()))).toBe('0.')
  })

  it('starts 0. after a value', () => {
    expect(main(keys('.', valueState()))).toBe('0.')
  })

  it('appends to an entry', () => {
    expect(main(keys('.', entryState()))).toBe('12.')
  })

  it('recovers from an error with 0.', () => {
    expect(keys('.', errorState())).toEqual({
      ...initialState,
      input: { kind: 'entry', text: '0.' },
      nextId: 1,
    })
  })
})

describe('toggleSign', () => {
  it('adds and removes the leading minus of an entry', () => {
    expect(main(keys('5n'))).toBe('-5')
    expect(main(keys('5nn'))).toBe('5')
    expect(main(keys('n'))).toBe('-0')
  })

  it('negates a value', () => {
    expect(keys('n', valueState()).input).toEqual({ kind: 'value', value: -3 })
  })

  it('negates the accumulator into the input after an operator', () => {
    const state = keys('n', operatorState())
    expect(state.input).toEqual({ kind: 'value', value: -2 })
    expect(state.accumulator).toBe(2)
    expect(main(state)).toBe('-2')
    expect(keys('=', state).pending?.request).toEqual({
      operation: 'add',
      operands: [2, -2],
    })
  })

  it('keeps a zero value as 0', () => {
    const zeroValue = keys('n', answer(keys('0r'), ok(0)))
    expect(zeroValue.input?.kind === 'value' && Object.is(zeroValue.input.value, 0)).toBe(true)

    const zeroAccumulator = keys('0+n')
    expect(
      zeroAccumulator.input?.kind === 'value' && Object.is(zeroAccumulator.input.value, 0),
    ).toBe(true)
  })

  it('is ignored while an error is set', () => {
    const state = errorState()
    expect(keys('n', state)).toBe(state)
  })
})

describe('backspace', () => {
  it('is ignored on a value', () => {
    const state = valueState()
    expect(keys('b', state)).toBe(state)
  })

  it('is ignored right after an operator', () => {
    const state = operatorState()
    expect(keys('b', state)).toBe(state)
  })

  it('clears an error back to the initial state', () => {
    expect(keys('b', errorState())).toEqual({ ...initialState, nextId: 1 })
  })
})

describe('operator', () => {
  it('stores the entry as accumulator when no operator is set', () => {
    expect(keys('12+')).toEqual({
      ...initialState,
      accumulator: 12,
      operator: 'add',
      input: null,
    })
  })

  it('stores a value as accumulator when no operator is set', () => {
    const state = keys('*', valueState())
    expect(state.accumulator).toBe(3)
    expect(state.operator).toBe('multiply')
    expect(state.input).toBeNull()
  })

  it('replaces the operator right after another', () => {
    const state = keys('*', operatorState())
    expect(state.operator).toBe('multiply')
    expect(state.accumulator).toBe(2)
    expect(state.pending).toBeNull()
  })

  it('requests the pending operation with a chain follow-up', () => {
    expect(keys('2+3*').pending).toEqual({
      id: 0,
      request: { operation: 'add', operands: [2, 3] },
      followUp: { kind: 'chain', operator: 'multiply' },
    })
    expect(keys('2+3*').nextId).toBe(1)
  })

  it('uses a value as the second operand', () => {
    const state = keys('-', answer(keys('2+9r'), ok(3)))
    expect(state.pending?.request).toEqual({ operation: 'add', operands: [2, 3] })
  })

  it('is ignored while an error is set', () => {
    const state = errorState()
    expect(keys('+', state)).toBe(state)
  })
})

describe('sqrt', () => {
  it('requests the square root of an entry', () => {
    expect(keys('9r').pending).toEqual({
      id: 0,
      request: { operation: 'sqrt', operands: [9] },
      followUp: { kind: 'sqrt' },
    })
  })

  it('requests the square root of a value', () => {
    expect(keys('r', valueState()).pending?.request).toEqual({
      operation: 'sqrt',
      operands: [3],
    })
  })

  it('requests the square root of the accumulator right after an operator', () => {
    expect(keys('r', operatorState()).pending?.request).toEqual({
      operation: 'sqrt',
      operands: [2],
    })
  })

  it('is ignored while an error is set', () => {
    const state = errorState()
    expect(keys('r', state)).toBe(state)
  })
})

describe('equals', () => {
  it('is ignored with no operator', () => {
    const state = entryState()
    expect(keys('=', state)).toBe(state)
  })

  it('is ignored right after an operator', () => {
    const state = operatorState()
    expect(keys('=', state)).toBe(state)
  })

  it('requests the pending operation with an equals follow-up', () => {
    expect(keys('2+3=').pending).toEqual({
      id: 0,
      request: { operation: 'add', operands: [2, 3] },
      followUp: { kind: 'equals' },
    })
  })

  it('is ignored while an error is set', () => {
    const state = errorState()
    expect(keys('=', state)).toBe(state)
  })
})

describe('clear', () => {
  it('returns the initial state', () => {
    expect(keys('2+3c')).toEqual(initialState)
  })

  it('clears an error', () => {
    expect(keys('c', errorState())).toEqual({ ...initialState, nextId: 1 })
  })

  it('keeps nextId', () => {
    expect(keys('c', answer(keys('2+3='), ok(5))).nextId).toBe(1)
  })

  it('drops a pending request', () => {
    expect(keys('c', pendingState())).toEqual({ ...initialState, nextId: 1 })
  })
})

describe('while a request is pending', () => {
  it.each([
    { type: 'digit', digit: '5' },
    { type: 'decimal' },
    { type: 'toggleSign' },
    { type: 'backspace' },
    { type: 'operator', operator: 'multiply' },
    { type: 'sqrt' },
    { type: 'equals' },
  ] satisfies UserAction[])('ignores $type', (action) => {
    const state = pendingState()
    expect(reducer(state, action)).toBe(state)
  })

  it('reports busy and keeps showing the input', () => {
    const view = selectView(pendingState())
    expect(view.busy).toBe(true)
    expect(view.main).toBe('3')
    expect(view.expression).toBe('2 +')
  })
})

describe('response', () => {
  it('chains: the result becomes the accumulator with the new operator', () => {
    const state = answer(keys('2+3*'), ok(5))
    expect(state).toEqual({
      ...initialState,
      accumulator: 5,
      operator: 'multiply',
      input: null,
      nextId: 1,
    })
    expect(selectView(state)).toMatchObject({ main: '5', expression: '5 ×', busy: false })
  })

  it('equals: clears the operator and shows the result as a value', () => {
    expect(answer(keys('2+3='), ok(5))).toEqual({
      ...initialState,
      input: { kind: 'value', value: 5 },
      nextId: 1,
    })
  })

  it('sqrt: the result becomes the input and the operator stays', () => {
    const state = answer(keys('2+9r'), ok(3))
    expect(state).toEqual({
      ...initialState,
      accumulator: 2,
      operator: 'add',
      input: { kind: 'value', value: 3 },
      nextId: 1,
    })
  })

  it('api-error: initial state with the code', () => {
    const state = errorState()
    expect(state).toEqual({ ...initialState, error: 'division_by_zero', nextId: 1 })
    expect(selectView(state)).toMatchObject({ main: 'Cannot divide by zero', isError: true })
  })

  it('network-error: initial state with the network reason', () => {
    const state = answer(pendingState(), { kind: 'network-error' })
    expect(state).toEqual({ ...initialState, error: 'network', nextId: 1 })
    expect(main(state)).toBe('Cannot reach the server, try again')
  })

  it('aborted: clears pending and changes nothing else', () => {
    const state = pendingState()
    expect(answer(state, { kind: 'aborted' })).toEqual({ ...state, pending: null })
  })

  it('is ignored when its id is stale', () => {
    const state = pendingState()
    expect(reducer(state, { type: 'response', id: 7, outcome: ok(5) })).toBe(state)
  })

  it('is ignored when nothing is pending', () => {
    expect(reducer(initialState, { type: 'response', id: 0, outcome: ok(5) })).toBe(initialState)
  })

  it('from before a clear does not match the next request', () => {
    const state = keys('c4+5=', pendingState())
    expect(state.pending?.id).toBe(1)
    expect(reducer(state, { type: 'response', id: 0, outcome: ok(5) })).toBe(state)
  })
})

describe('selectView', () => {
  it.each([
    ['add', '+'],
    ['subtract', '−'],
    ['multiply', '×'],
    ['divide', '÷'],
    ['power', '^'],
    ['percentage', '%'],
  ] satisfies [BinaryOperation, string][])('shows %s as %s and presses its key', (operator, symbol) => {
    const state = keys('2', initialState)
    const view = selectView(reducer(state, { type: 'operator', operator }))
    expect(view.expression).toBe(`2 ${symbol}`)
    expect(view.pressedOperator).toBe(operator)
  })

  it('shows the accumulator right after an operator', () => {
    expect(main(operatorState())).toBe('2')
  })

  it('shows an entry exactly as typed', () => {
    expect(main(keys('1.50'))).toBe('1.50')
  })

  it('shows a value rounded while the state keeps it in full', () => {
    const state = answer(keys('0.1+0.2='), ok(0.30000000000000004))
    expect(main(state)).toBe('0.3')
    expect(keys('*10=', state).pending?.request).toEqual({
      operation: 'multiply',
      operands: [0.30000000000000004, 10],
    })
  })
})

describe('worked examples', () => {
  // Presses each key; whenever a request is pending, records it and answers
  // with the next outcome.
  function play(sequence: string, outcomes: CalculationOutcome[]) {
    const requests: CalculationRequest[] = []
    const remaining = [...outcomes]
    let state = initialState
    for (const key of sequence) {
      state = reducer(state, toAction(key))
      if (state.pending !== null) {
        requests.push(state.pending.request)
        state = answer(state, remaining.shift()!)
      }
    }
    expect(remaining).toEqual([])
    return { requests, main: main(state) }
  }

  it.each<[string, CalculationOutcome[], CalculationRequest[], string]>([
    [
      '2+3*4=',
      [ok(5), ok(20)],
      [
        { operation: 'add', operands: [2, 3] },
        { operation: 'multiply', operands: [5, 4] },
      ],
      '20',
    ],
    ['10%200=', [ok(20)], [{ operation: 'percentage', operands: [10, 200] }], '20'],
    [
      '2+9r=',
      [ok(3), ok(5)],
      [
        { operation: 'sqrt', operands: [9] },
        { operation: 'add', operands: [2, 3] },
      ],
      '5',
    ],
    [
      '2+r=',
      [ok(1.4142135623730951), ok(3.414213562373095)],
      [
        { operation: 'sqrt', operands: [2] },
        { operation: 'add', operands: [2, 1.4142135623730951] },
      ],
      '3.41421356237',
    ],
    ['2+*3=', [ok(6)], [{ operation: 'multiply', operands: [2, 3] }], '6'],
    ['2+=', [], [], '2'],
    ['2+3==', [ok(5)], [{ operation: 'add', operands: [2, 3] }], '5'],
    ['1/0=', [DIVISION_BY_ZERO], [{ operation: 'divide', operands: [1, 0] }], 'Cannot divide by zero'],
  ])('%s', (sequence, outcomes, requests, expected) => {
    const result = play(sequence, outcomes)
    expect(result.requests).toEqual(requests)
    expect(result.main).toBe(expected)
  })
})
