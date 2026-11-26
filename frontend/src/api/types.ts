// Written by hand from backend/api/openapi.yaml.

export type BinaryOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'percentage'

export type CalculationRequest =
  | { operation: 'sqrt'; operands: [number] }
  | { operation: BinaryOperation; operands: [number, number] }

export type ApiErrorCode =
  | 'invalid_json'
  | 'invalid_request'
  | 'unknown_operation'
  | 'invalid_operand_count'
  | 'not_found'
  | 'method_not_allowed'
  | 'body_too_large'
  | 'unsupported_media_type'
  | 'division_by_zero'
  | 'negative_square_root'
  | 'result_out_of_range'
  | 'undefined_result'
  | 'internal_error'

export type CalculationOutcome =
  | { kind: 'success'; result: number }
  | { kind: 'api-error'; code: ApiErrorCode }
  | { kind: 'network-error' }
  | { kind: 'aborted' }
