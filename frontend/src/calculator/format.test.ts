import { describe, expect, it } from 'vitest'
import { formatNumber } from './format'

describe('formatNumber', () => {
  it.each([
    [20, '20'],
    [0.30000000000000004, '0.3'],
    [1234567.5, '1234567.5'],
    [123456789012, '123456789012'],
    [1234567890123, '1.23456789012e+12'],
    [999999999999.5, '1e+12'],
    [1e15, '1e+15'],
    [0.000001, '0.000001'],
    [0.00000012, '1.2e-7'],
    [-9.332636185032189e-302, '-9.33263618503e-302'],
    [-0, '0'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })
})
