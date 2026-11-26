import { describe, expect, it } from 'vitest'
import { keyToAction } from './keyboard'
import type { UserAction } from './reducer'

describe('keyToAction', () => {
  it.each(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])('maps %s to its digit', (key) => {
    expect(keyToAction(key)).toEqual({ type: 'digit', digit: key })
  })

  it.each<[string, UserAction]>([
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['p', { type: 'operator', operator: 'power' }],
    ['P', { type: 'operator', operator: 'power' }],
    ['^', { type: 'operator', operator: 'power' }],
    ['%', { type: 'operator', operator: 'percentage' }],
    ['r', { type: 'sqrt' }],
    ['R', { type: 'sqrt' }],
    ['n', { type: 'toggleSign' }],
    ['N', { type: 'toggleSign' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Escape', { type: 'clear' }],
    ['Backspace', { type: 'backspace' }],
    ['Delete', { type: 'backspace' }],
  ])('maps %s', (key, action) => {
    expect(keyToAction(key)).toEqual(action)
  })

  it.each(['a', ' ', 'Tab', 'Dead', 'x', '10', 'toString'])('returns null for %j', (key) => {
    expect(keyToAction(key)).toBeNull()
  })
})
