import type { UserAction } from './reducer'

const KEY_ACTIONS: Record<string, UserAction> = {
  '.': { type: 'decimal' },
  ',': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  p: { type: 'operator', operator: 'power' },
  P: { type: 'operator', operator: 'power' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'operator', operator: 'percentage' },
  r: { type: 'sqrt' },
  R: { type: 'sqrt' },
  n: { type: 'toggleSign' },
  N: { type: 'toggleSign' },
  Enter: { type: 'equals' },
  '=': { type: 'equals' },
  Escape: { type: 'clear' },
  Backspace: { type: 'backspace' },
  Delete: { type: 'backspace' },
}

/** Maps a `KeyboardEvent.key` to its calculator action, or null if unmapped. */
export function keyToAction(key: string): UserAction | null {
  if (/^[0-9]$/.test(key)) {
    return { type: 'digit', digit: key }
  }
  return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : null
}
