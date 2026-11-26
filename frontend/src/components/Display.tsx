import styles from './Display.module.css'

// Up to this many characters the main line uses its large size.
const LARGE_MAX_LENGTH = 12

type DisplayProps = {
  main: string
  expression: string
  isError: boolean
}

export function Display({ main, expression, isError }: DisplayProps) {
  const variant = isError
    ? styles.error
    : main.length > LARGE_MAX_LENGTH
      ? styles.small
      : styles.large

  return (
    <div className={styles.display}>
      <div className={styles.expression}>{expression}</div>
      <output className={`${styles.main} ${variant}`} aria-live="polite">
        {main}
      </output>
    </div>
  )
}
