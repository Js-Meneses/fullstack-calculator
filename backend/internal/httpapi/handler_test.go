package httpapi_test

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/httpapi"
)

const path = "/api/v1/calculations"

// Messages from the spec's error table.
const (
	msgInvalidJSON      = "The request body must be a single valid JSON value."
	msgInvalidRequest   = `The request body must be an object with a string "operation" and an array of numbers "operands".`
	msgUnknownOperation = "Unknown operation. Use one of: add, subtract, multiply, divide, power, sqrt, percentage."
	msgOperandCount     = "Wrong number of operands: sqrt takes 1, every other operation takes 2."
	msgNotFound         = "No resource at this path."
	msgMethodNotAllowed = "Only POST is allowed on this path."
	msgBodyTooLarge     = "The request body must not exceed 1024 bytes."
	msgUnsupportedMedia = "The Content-Type must be application/json."
	msgDivisionByZero   = "Division by zero is undefined."
	msgNegativeSqrt     = "The square root of a negative number is not a real number."
	msgOutOfRange       = "The result is too large to represent."
	msgUndefinedResult  = "The result is not a real number."
	msgInternalError    = "Internal server error."
)

const contentTypeJSON = "application/json"

// send passes one request through the handler and checks the Content-Type
// header that every response must carry.
func send(t *testing.T, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	httpapi.NewHandler().ServeHTTP(rec, req)

	if got := rec.Header().Get("Content-Type"); got != contentTypeJSON {
		t.Errorf("Content-Type = %q, want %q", got, contentTypeJSON)
	}
	return rec
}

// serve sends a request with a JSON Content-Type.
func serve(t *testing.T, method, target string, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, body)
	req.Header.Set("Content-Type", contentTypeJSON)
	return send(t, req)
}

func post(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return serve(t, http.MethodPost, path, strings.NewReader(body))
}

// postAs sends a POST with the given Content-Type. An empty contentType omits
// the header.
func postAs(t *testing.T, contentType, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return send(t, req)
}

// padTo appends spaces to a JSON body until it is exactly size bytes long.
func padTo(t *testing.T, body string, size int) string {
	t.Helper()
	if len(body) > size {
		t.Fatalf("body is %d bytes, longer than %d", len(body), size)
	}
	return body + strings.Repeat(" ", size-len(body))
}

// assertError checks the status and the JSON error body of a response.
func assertError(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantCode, wantMessage string) {
	t.Helper()
	if rec.Code != wantStatus {
		t.Errorf("status = %d, want %d", rec.Code, wantStatus)
	}

	var got struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	dec := json.NewDecoder(rec.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&got); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if got.Error.Code != wantCode {
		t.Errorf("code = %q, want %q", got.Error.Code, wantCode)
	}
	if got.Error.Message != wantMessage {
		t.Errorf("message = %q, want %q", got.Error.Message, wantMessage)
	}
}

func TestCalculationsSuccess(t *testing.T) {
	tests := []struct {
		name     string
		target   string
		body     string
		wantBody string
	}{
		{"add", path, `{"operation":"add","operands":[2,3]}`, `{"result":5}`},
		{"subtract", path, `{"operation":"subtract","operands":[2,5]}`, `{"result":-3}`},
		{"multiply", path, `{"operation":"multiply","operands":[4,2.5]}`, `{"result":10}`},
		{"divide", path, `{"operation":"divide","operands":[7,2]}`, `{"result":3.5}`},
		{"power", path, `{"operation":"power","operands":[2,10]}`, `{"result":1024}`},
		{"sqrt", path, `{"operation":"sqrt","operands":[9]}`, `{"result":3}`},
		{"percentage", path, `{"operation":"percentage","operands":[50,10]}`, `{"result":5}`},
		{"negative zero is returned as zero", path, `{"operation":"multiply","operands":[-1,0]}`, `{"result":0}`},
		{"raw float64 result", path, `{"operation":"add","operands":[0.1,0.2]}`, `{"result":0.30000000000000004}`},
		{"query string is ignored", path + "?debug=1", `{"operation":"add","operands":[2,3]}`, `{"result":5}`},
		{"surrounding whitespace", path, " \n\t{\"operation\":\"add\",\"operands\":[2,3]}\r\n ", `{"result":5}`},
		{"field names match case-insensitively", path, `{"OPERATION":"add","Operands":[2,3]}`, `{"result":5}`},
		{"repeated key keeps the last value", path, `{"operation":"subtract","operation":"add","operands":[2,3]}`, `{"result":5}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, http.MethodPost, tt.target, strings.NewReader(tt.body))
			if rec.Code != http.StatusOK {
				t.Errorf("status = %d, want %d; body %s", rec.Code, http.StatusOK, rec.Body)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %s, want %s", got, tt.wantBody)
			}
		})
	}
}

func TestCalculationsDomainErrors(t *testing.T) {
	tests := []struct {
		name        string
		body        string
		wantStatus  int
		wantCode    string
		wantMessage string
	}{
		{"unknown operation", `{"operation":"modulo","operands":[1,2]}`, http.StatusBadRequest, "unknown_operation", msgUnknownOperation},
		{"operation is case-sensitive", `{"operation":"ADD","operands":[1,2]}`, http.StatusBadRequest, "unknown_operation", msgUnknownOperation},
		{"too few operands", `{"operation":"add","operands":[1]}`, http.StatusBadRequest, "invalid_operand_count", msgOperandCount},
		{"too many operands", `{"operation":"sqrt","operands":[4,9]}`, http.StatusBadRequest, "invalid_operand_count", msgOperandCount},
		{"empty operands", `{"operation":"add","operands":[]}`, http.StatusBadRequest, "invalid_operand_count", msgOperandCount},
		{"divide by zero", `{"operation":"divide","operands":[1,0]}`, http.StatusUnprocessableEntity, "division_by_zero", msgDivisionByZero},
		{"zero to a negative power", `{"operation":"power","operands":[0,-1]}`, http.StatusUnprocessableEntity, "division_by_zero", msgDivisionByZero},
		{"negative square root", `{"operation":"sqrt","operands":[-4]}`, http.StatusUnprocessableEntity, "negative_square_root", msgNegativeSqrt},
		{"result out of range", `{"operation":"multiply","operands":[1e308,10]}`, http.StatusUnprocessableEntity, "result_out_of_range", msgOutOfRange},
		{"undefined result", `{"operation":"power","operands":[-8,0.5]}`, http.StatusUnprocessableEntity, "undefined_result", msgUndefinedResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, post(t, tt.body), tt.wantStatus, tt.wantCode, tt.wantMessage)
		})
	}
}

func TestCalculationsInvalidJSON(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"whitespace-only body", " \n\t "},
		{"truncated object", `{"operation":"add","operands":[1,2]`},
		{"syntax error", `{"operation":"add",}`},
		{"not JSON", `add 1 2`},
		{"trailing JSON value", `{"operation":"add","operands":[1,2]}{}`},
		{"trailing garbage", `{"operation":"add","operands":[1,2]} x`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, post(t, tt.body), http.StatusBadRequest, "invalid_json", msgInvalidJSON)
		})
	}
}

func TestCalculationsInvalidRequest(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"top-level null", `null`},
		{"top-level array", `[]`},
		{"top-level string", `"add"`},
		{"top-level number", `5`},
		{"empty object", `{}`},
		{"missing operation", `{"operands":[1,2]}`},
		{"missing operands", `{"operation":"add"}`},
		{"null operation", `{"operation":null,"operands":[1,2]}`},
		{"null operands", `{"operation":"add","operands":null}`},
		{"operation is a number", `{"operation":5,"operands":[1,2]}`},
		{"operands is a string", `{"operation":"add","operands":"1,2"}`},
		{"operand is a string", `{"operation":"add","operands":[1,"2"]}`},
		{"operand is a boolean", `{"operation":"add","operands":[1,true]}`},
		{"null operand", `{"operation":"add","operands":[1,null]}`},
		{"only operand is null", `{"operation":"sqrt","operands":[null]}`},
		{"unknown field", `{"operation":"add","operands":[1,2],"precision":2}`},
		{"number outside float64 range", `{"operation":"add","operands":[1e400,1]}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, post(t, tt.body), http.StatusBadRequest, "invalid_request", msgInvalidRequest)
		})
	}
}

func TestCalculationsNotFound(t *testing.T) {
	tests := []struct {
		name   string
		method string
		target string
	}{
		{"root", http.MethodPost, "/"},
		{"trailing slash", http.MethodPost, path + "/"},
		{"different case", http.MethodPost, "/API/v1/calculations"},
		{"singular resource", http.MethodPost, "/api/v1/calculation"},
		{"sub-resource", http.MethodPost, path + "/1"},
		{"path is checked before method", http.MethodGet, "/nope"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := strings.NewReader(`{"operation":"add","operands":[2,3]}`)
			assertError(t, serve(t, tt.method, tt.target, body), http.StatusNotFound, "not_found", msgNotFound)
		})
	}
}

func TestCalculationsMethodNotAllowed(t *testing.T) {
	methods := []string{
		http.MethodGet, http.MethodHead, http.MethodOptions,
		http.MethodPut, http.MethodPatch, http.MethodDelete,
	}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			rec := serve(t, method, path, nil)
			if got := rec.Header().Get("Allow"); got != "POST" {
				t.Errorf("Allow = %q, want %q", got, "POST")
			}
			assertError(t, rec, http.StatusMethodNotAllowed, "method_not_allowed", msgMethodNotAllowed)
		})
	}
}

func TestCalculationsContentType(t *testing.T) {
	const body = `{"operation":"add","operands":[2,3]}`

	accepted := []string{
		"application/json",
		"application/json; charset=utf-8",
		"Application/JSON",
		"application/json; charset", // a malformed parameter is ignored
	}
	for _, contentType := range accepted {
		t.Run("accepts "+contentType, func(t *testing.T) {
			rec := postAs(t, contentType, body)
			if rec.Code != http.StatusOK {
				t.Errorf("status = %d, want %d; body %s", rec.Code, http.StatusOK, rec.Body)
			}
		})
	}

	rejected := []struct {
		name        string
		contentType string
	}{
		{"missing", ""},
		{"text/plain", "text/plain"},
		{"form", "application/x-www-form-urlencoded"},
		{"JSON suffix", "application/problem+json"},
		{"unparseable", "application/"},
	}
	for _, tt := range rejected {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			rec := postAs(t, tt.contentType, body)
			assertError(t, rec, http.StatusUnsupportedMediaType, "unsupported_media_type", msgUnsupportedMedia)
		})
	}
}

func TestCalculationsBodySize(t *testing.T) {
	const body = `{"operation":"add","operands":[2,3]}`

	t.Run("1024 bytes are processed", func(t *testing.T) {
		rec := post(t, padTo(t, body, 1024))
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want %d; body %s", rec.Code, http.StatusOK, rec.Body)
		}
		if got, want := rec.Body.String(), `{"result":5}`; got != want {
			t.Errorf("body = %s, want %s", got, want)
		}
	})
	t.Run("1024 bytes of invalid JSON are parsed", func(t *testing.T) {
		rec := post(t, strings.Repeat("x", 1024))
		assertError(t, rec, http.StatusBadRequest, "invalid_json", msgInvalidJSON)
	})
	t.Run("1025 bytes are too large", func(t *testing.T) {
		rec := post(t, padTo(t, body, 1025))
		assertError(t, rec, http.StatusRequestEntityTooLarge, "body_too_large", msgBodyTooLarge)
	})
	t.Run("size is checked before syntax", func(t *testing.T) {
		rec := post(t, strings.Repeat("x", 4096))
		assertError(t, rec, http.StatusRequestEntityTooLarge, "body_too_large", msgBodyTooLarge)
	})
}

func TestCalculationsCheckOrder(t *testing.T) {
	large := strings.Repeat(" ", 2048)

	t.Run("method before content type", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		assertError(t, send(t, req), http.StatusMethodNotAllowed, "method_not_allowed", msgMethodNotAllowed)
	})
	t.Run("content type before body size", func(t *testing.T) {
		rec := postAs(t, "text/plain", large)
		assertError(t, rec, http.StatusUnsupportedMediaType, "unsupported_media_type", msgUnsupportedMedia)
	})
}

// failingReader is a request body whose read always fails.
type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestCalculationsBodyReadFailure(t *testing.T) {
	rec := serve(t, http.MethodPost, path, failingReader{})
	assertError(t, rec, http.StatusInternalServerError, "internal_error", msgInternalError)
}
