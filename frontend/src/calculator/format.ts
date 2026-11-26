/**
 * Formats a result for display: at most 12 significant digits, exponent form
 * below 1e-6 or from 1e12, no trailing zeros. `-0` formats as `0`, because
 * `toPrecision` writes it without a sign.
 */
export function formatNumber(value: number): string {
  const [digits, exponent] = value.toPrecision(12).split('e')
  const trimmed = digits.includes('.')
    ? digits.replace(/0+$/, '').replace(/\.$/, '')
    : digits
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`
}
