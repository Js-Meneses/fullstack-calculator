package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
)

// calculationRequest is the JSON body of POST /api/v1/calculations. Its fields
// stay nil when they are missing or null, so both cases can be rejected.
type calculationRequest struct {
	Operation *string   `json:"operation"`
	Operands  []float64 `json:"operands"`
}

// decodeRequest reads the request body and returns its operation and operands.
// A body that is not a single JSON value is errInvalidJSON; a JSON value of the
// wrong shape is errInvalidRequest.
func decodeRequest(body io.Reader) (operation string, operands []float64, err error) {
	data, err := io.ReadAll(body)
	if err != nil {
		return "", nil, fmt.Errorf("read request body: %w", err)
	}
	if !json.Valid(data) {
		return "", nil, errInvalidJSON
	}

	var req calculationRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return "", nil, errInvalidRequest
	}
	if req.Operation == nil || req.Operands == nil {
		return "", nil, errInvalidRequest
	}
	return *req.Operation, req.Operands, nil
}
