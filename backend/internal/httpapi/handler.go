// Package httpapi exposes the calculator over HTTP as a JSON API.
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/calculator"
)

const calculationsPath = "/api/v1/calculations"

// calculationResponse is the JSON body of a successful calculation.
type calculationResponse struct {
	Result float64 `json:"result"`
}

// NewHandler returns the handler for the whole API. It answers every path, so
// unknown paths and methods also get JSON error responses.
func NewHandler() http.Handler {
	return http.HandlerFunc(serveCalculations)
}

func serveCalculations(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != calculationsPath {
		writeError(w, errNotFound)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, errMethodNotAllowed)
		return
	}

	operation, operands, err := decodeRequest(r.Body)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calculator.Calculate(operation, operands)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, calculationResponse{Result: result})
}

// writeJSON writes v as the JSON response body with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	// The response types hold only strings and finite float64 values, which
	// always encode, so Marshal cannot fail here.
	body, _ := json.Marshal(v)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
