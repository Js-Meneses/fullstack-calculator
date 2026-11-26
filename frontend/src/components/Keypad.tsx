import type { BinaryOperation } from '../api/types'
import type { UserAction } from '../calculator/reducer'
import styles from './Keypad.module.css'

type Key = {
  label: string
  name?: string // accessible name, when it differs from the label
  action: UserAction
  className?: string
}

function digit(value: string, className?: string): Key {
  return { label: value, action: { type: 'digit', digit: value }, className }
}

function operator(label: string, name: string, op: BinaryOperation): Key {
  return { label, name, action: { type: 'operator', operator: op }, className: styles.operator }
}

// In grid order: four columns, `=` spans two rows and `0` two columns.
const KEYS: Key[] = [
  { label: 'C', name: 'Clear', action: { type: 'clear' }, className: styles.function },
  { label: '⌫', name: 'Backspace', action: { type: 'backspace' }, className: styles.function },
  operator('%', 'Percentage', 'percentage'),
  operator('÷', 'Divide', 'divide'),
  { label: '√', name: 'Square root', action: { type: 'sqrt' }, className: styles.function },
  operator('xʸ', 'Power', 'power'),
  { label: '±', name: 'Toggle sign', action: { type: 'toggleSign' }, className: styles.function },
  operator('×', 'Multiply', 'multiply'),
  digit('7'),
  digit('8'),
  digit('9'),
  operator('−', 'Subtract', 'subtract'),
  digit('4'),
  digit('5'),
  digit('6'),
  operator('+', 'Add', 'add'),
  digit('1'),
  digit('2'),
  digit('3'),
  { label: '=', name: 'Equals', action: { type: 'equals' }, className: styles.equals },
  digit('0', styles.wide),
  { label: '.', name: 'Decimal point', action: { type: 'decimal' } },
]

type KeypadProps = {
  press: (action: UserAction) => void
  busy: boolean
  pressedOperator: BinaryOperation | null
}

export function Keypad({ press, busy, pressedOperator }: KeypadProps) {
  return (
    <div className={styles.keypad}>
      {KEYS.map(({ label, name, action, className }) => (
        <button
          key={label}
          type="button"
          className={className ? `${styles.key} ${className}` : styles.key}
          aria-label={name}
          aria-pressed={action.type === 'operator' ? action.operator === pressedOperator : undefined}
          aria-disabled={busy && action.type !== 'clear' ? true : undefined}
          onClick={() => press(action)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
