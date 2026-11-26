import { describe, expect, it } from 'vitest'
import { ERROR_MESSAGES, type ErrorReason } from './messages'

const EXPECTED: [ErrorReason, string][] = [
  ['division_by_zero', 'Cannot divide by zero'],
  ['negative_square_root', 'No square root of a negative number'],
  ['result_out_of_range', 'Result is too large'],
  ['undefined_result', 'Result is undefined'],
  ['invalid_json', 'Request could not be read'],
  ['invalid_request', 'Request was not valid'],
  ['unknown_operation', 'Operation not supported'],
  ['invalid_operand_count', 'Wrong number of operands'],
  ['not_found', 'Service not found'],
  ['method_not_allowed', 'Request method not allowed'],
  ['body_too_large', 'Request is too large'],
  ['unsupported_media_type', 'Request format not supported'],
  ['internal_error', 'Server error, try again'],
  ['network', 'Cannot reach the server, try again'],
]

describe('ERROR_MESSAGES', () => {
  it.each(EXPECTED)('shows %s as "%s"', (reason, message) => {
    expect(ERROR_MESSAGES[reason]).toBe(message)
  })

  it('has a non-empty message for every reason', () => {
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(EXPECTED.length)
    for (const message of Object.values(ERROR_MESSAGES)) {
      expect(message.trim()).not.toBe('')
    }
  })

  it('never gives two reasons the same message', () => {
    const messages = Object.values(ERROR_MESSAGES)
    expect(new Set(messages).size).toBe(messages.length)
  })
})
