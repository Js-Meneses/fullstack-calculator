package httpapi

import (
	"errors"
	"net/http"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/calculator"
)

// Errors raised by the HTTP layer itself, before the domain is called.
var (
	errNotFound         = errors.New("no resource at this path")
	errMethodNotAllowed = errors.New("method not allowed")
	errInvalidJSON      = errors.New("body is not a single JSON value")
	errInvalidRequest   = errors.New("body does not match the request shape")
)

// errorResponse is the JSON body of every non-200 response.
type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// mapError translates an error into its HTTP status, machine-readable code and
// human-readable message. Any error it does not know is a 500.
func mapError(err error) (status int, code, message string) {
	switch {
	case errors.Is(err, errInvalidJSON):
		return http.StatusBadRequest, "invalid_json",
			"The request body must be a single valid JSON value."
	case errors.Is(err, errInvalidRequest):
		return http.StatusBadRequest, "invalid_request",
			`The request body must be an object with a string "operation" and an array of numbers "operands".`
	case errors.Is(err, calculator.ErrUnknownOperation):
		return http.StatusBadRequest, "unknown_operation",
			"Unknown operation. Use one of: add, subtract, multiply, divide, power, sqrt, percentage."
	case errors.Is(err, calculator.ErrOperandCount):
		return http.StatusBadRequest, "invalid_operand_count",
			"Wrong number of operands: sqrt takes 1, every other operation takes 2."
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, "not_found",
			"No resource at this path."
	case errors.Is(err, errMethodNotAllowed):
		return http.StatusMethodNotAllowed, "method_not_allowed",
			"Only POST is allowed on this path."
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, "division_by_zero",
			"Division by zero is undefined."
	case errors.Is(err, calculator.ErrNegativeSquareRoot):
		return http.StatusUnprocessableEntity, "negative_square_root",
			"The square root of a negative number is not a real number."
	case errors.Is(err, calculator.ErrOutOfRange):
		return http.StatusUnprocessableEntity, "result_out_of_range",
			"The result is too large to represent."
	case errors.Is(err, calculator.ErrUndefinedResult):
		return http.StatusUnprocessableEntity, "undefined_result",
			"The result is not a real number."
	default:
		return http.StatusInternalServerError, "internal_error",
			"Internal server error."
	}
}

// writeError writes the JSON error response for err.
func writeError(w http.ResponseWriter, err error) {
	status, code, message := mapError(err)
	writeJSON(w, status, errorResponse{Error: errorDetail{Code: code, Message: message}})
}
