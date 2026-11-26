package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
)

// maxBodyBytes is the largest request body that is processed.
const maxBodyBytes = 1024

// calculationRequest is the JSON body of POST /api/v1/calculations. Its fields
// and the operand elements stay nil when they are missing or null, so every
// such case can be rejected instead of silently becoming zero.
type calculationRequest struct {
	Operation *string    `json:"operation"`
	Operands  []*float64 `json:"operands"`
}

// decodeRequest checks the Content-Type, reads the body and returns its
// operation and operands. The checks run in the spec's order: media type
// (errUnsupportedMediaType), size (errBodyTooLarge), JSON syntax
// (errInvalidJSON) and request shape (errInvalidRequest).
func decodeRequest(r *http.Request) (operation string, operands []float64, err error) {
	if !isJSON(r.Header.Get("Content-Type")) {
		return "", nil, errUnsupportedMediaType
	}

	// Read one byte past the limit, so an oversized body is detected before
	// any parsing, wherever its syntax errors are.
	data, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		return "", nil, fmt.Errorf("read request body: %w", err)
	}
	if len(data) > maxBodyBytes {
		return "", nil, errBodyTooLarge
	}
	if !json.Valid(data) {
		return "", nil, errInvalidJSON
	}

	var req calculationRequest
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return "", nil, errInvalidRequest
	}
	if req.Operation == nil || req.Operands == nil {
		return "", nil, errInvalidRequest
	}

	operands = make([]float64, len(req.Operands))
	for i, operand := range req.Operands {
		if operand == nil {
			return "", nil, errInvalidRequest
		}
		operands[i] = *operand
	}
	return *req.Operation, operands, nil
}

// isJSON reports whether a Content-Type header names the media type
// application/json. Parameters, including malformed ones, are ignored.
func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil && !errors.Is(err, mime.ErrInvalidMediaParameter) {
		return false
	}
	return mediaType == "application/json"
}
