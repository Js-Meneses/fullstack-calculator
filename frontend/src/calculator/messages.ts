import type { ApiErrorCode } from '../api/types'

export type ErrorReason = ApiErrorCode | 'network'

// A Record, so a reason without a message fails the build.
export const ERROR_MESSAGES: Record<ErrorReason, string> = {
  division_by_zero: 'Cannot divide by zero',
  negative_square_root: 'No square root of a negative number',
  result_out_of_range: 'Result is too large',
  undefined_result: 'Result is undefined',
  invalid_json: 'Request could not be read',
  invalid_request: 'Request was not valid',
  unknown_operation: 'Operation not supported',
  invalid_operand_count: 'Wrong number of operands',
  not_found: 'Service not found',
  method_not_allowed: 'Request method not allowed',
  body_too_large: 'Request is too large',
  unsupported_media_type: 'Request format not supported',
  internal_error: 'Server error, try again',
  network: 'Cannot reach the server, try again',
}
