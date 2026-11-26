import { useCalculator } from '../calculator/useCalculator'
import styles from './Calculator.module.css'
import { Display } from './Display'
import { Keypad } from './Keypad'

export function Calculator() {
  const { view, press } = useCalculator()

  return (
    <main className={styles.page} aria-busy={view.busy}>
      <h1 className={styles.visuallyHidden}>Calculator</h1>
      <div className={styles.calculator}>
        <Display main={view.main} expression={view.expression} isError={view.isError} />
        <Keypad press={press} busy={view.busy} pressedOperator={view.pressedOperator} />
      </div>
    </main>
  )
}
