package httpapi

import (
	"errors"
	"net/http"
	"testing"
)

func TestMapErrorUnknownErrorIsInternal(t *testing.T) {
	status, code, message := mapError(errors.New("unexpected"))

	if status != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", status, http.StatusInternalServerError)
	}
	if code != "internal_error" {
		t.Errorf("code = %q, want %q", code, "internal_error")
	}
	if message != "Internal server error." {
		t.Errorf("message = %q, want %q", message, "Internal server error.")
	}
}
