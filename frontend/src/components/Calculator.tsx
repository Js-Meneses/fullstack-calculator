import { useEffect } from 'react'
import { keyToAction } from '../calculator/keyboard'
import { useCalculator } from '../calculator/useCalculator'
import styles from './Calculator.module.css'
import { Display } from './Display'
import { Keypad } from './Keypad'

export function Calculator() {
  const { view, press } = useCalculator()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Leave browser shortcuts such as Ctrl+R alone, but not AltGr, which
      // European layouts need and which Windows reports as Ctrl+Alt.
      const hasShortcutModifier =
        (event.ctrlKey || event.metaKey || event.altKey) &&
        !event.getModifierState('AltGraph')
      if (hasShortcutModifier) {
        return
      }
      const action = keyToAction(event.key)
      if (action === null) {
        return
      }
      // Enter means equals even when a key has focus, and must not also click it.
      event.preventDefault()
      press(action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [press])

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
