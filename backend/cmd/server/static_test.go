package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	indexBody  = "<!doctype html><title>Calculator</title>"
	appJSBody  = "console.log('app');"
	secretBody = "outside the static directory"
	plainText  = "text/plain; charset=utf-8"
)

// newStaticDir builds a static directory holding index.html, assets/app.js
// and an empty assets/empty/, with secret.txt placed next to it.
func newStaticDir(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "static")
	files := map[string]string{
		filepath.Join(dir, "index.html"):       indexBody,
		filepath.Join(dir, "assets", "app.js"): appJSBody,
		filepath.Join(root, "secret.txt"):      secretBody,
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets", "empty"), 0o755); err != nil {
		t.Fatalf("create directories: %v", err)
	}
	for name, body := range files {
		if err := os.WriteFile(name, []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return dir
}

func TestNewHandlerWithStaticDir(t *testing.T) {
	handler := newHandler(newStaticDir(t))

	tests := []struct {
		name        string
		method      string
		path        string
		body        string
		wantStatus  int
		wantType    string // checked when not empty
		wantHeaders map[string]string
		wantBody    string // exact match when wantContain is empty
		wantContain string
	}{
		{
			name: "index for the root", method: http.MethodGet, path: "/",
			wantStatus: http.StatusOK, wantType: "text/html; charset=utf-8", wantBody: indexBody,
		},
		{
			name: "HEAD on the root", method: http.MethodHead, path: "/",
			wantStatus: http.StatusOK,
		},
		{
			name: "regular file", method: http.MethodGet, path: "/assets/app.js",
			wantStatus: http.StatusOK, wantBody: appJSBody,
		},
		{
			name: "index.html redirects to its directory", method: http.MethodGet, path: "/index.html",
			wantStatus: http.StatusMovedPermanently, wantHeaders: map[string]string{"Location": "./"},
		},
		{
			name: "missing path", method: http.MethodGet, path: "/nope",
			wantStatus: http.StatusNotFound, wantType: plainText, wantBody: "404 page not found\n",
		},
		{
			name: "directory without index.html, trailing slash", method: http.MethodGet, path: "/assets/empty/",
			wantStatus: http.StatusNotFound, wantType: plainText, wantBody: "404 page not found\n",
		},
		{
			name: "directory without index.html, no trailing slash", method: http.MethodGet, path: "/assets/empty",
			wantStatus: http.StatusNotFound, wantType: plainText, wantBody: "404 page not found\n",
		},
		{
			name: "dot-dot does not leave the static directory", method: http.MethodGet, path: "/../secret.txt",
			wantStatus: http.StatusNotFound, wantType: plainText, wantBody: "404 page not found\n",
		},
		{
			name: "POST on the root", method: http.MethodPost, path: "/",
			wantStatus: http.StatusMethodNotAllowed, wantType: plainText,
			wantHeaders: map[string]string{"Allow": "GET, HEAD"}, wantBody: "Method Not Allowed\n",
		},
		{
			name: "POST on a missing path", method: http.MethodPost, path: "/nope",
			wantStatus: http.StatusMethodNotAllowed, wantType: plainText,
			wantHeaders: map[string]string{"Allow": "GET, HEAD"}, wantBody: "Method Not Allowed\n",
		},
		{
			name: "API calculation", method: http.MethodPost, path: "/api/v1/calculations",
			body:       `{"operation":"add","operands":[2,3]}`,
			wantStatus: http.StatusOK, wantType: "application/json", wantBody: `{"result":5}`,
		},
		{
			name: "API method not allowed", method: http.MethodGet, path: "/api/v1/calculations",
			wantStatus: http.StatusMethodNotAllowed, wantType: "application/json",
			wantHeaders: map[string]string{"Allow": "POST"}, wantContain: `"code":"method_not_allowed"`,
		},
		{
			name: "API root", method: http.MethodGet, path: "/api",
			wantStatus: http.StatusNotFound, wantType: "application/json", wantContain: `"code":"not_found"`,
		},
		{
			name: "unknown API path", method: http.MethodGet, path: "/api/nope",
			wantStatus: http.StatusNotFound, wantType: "application/json", wantContain: `"code":"not_found"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			if tt.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Header().Get("Content-Type"); tt.wantType != "" && got != tt.wantType {
				t.Errorf("Content-Type = %q, want %q", got, tt.wantType)
			}
			for key, want := range tt.wantHeaders {
				if got := rec.Header().Get(key); got != want {
					t.Errorf("%s = %q, want %q", key, got, want)
				}
			}
			body := rec.Body.String()
			switch {
			case tt.wantContain != "":
				if !strings.Contains(body, tt.wantContain) {
					t.Errorf("body = %q, want it to contain %q", body, tt.wantContain)
				}
			case tt.wantBody != "" || tt.method == http.MethodHead:
				if body != tt.wantBody {
					t.Errorf("body = %q, want %q", body, tt.wantBody)
				}
			}
			if strings.Contains(body, secretBody) {
				t.Errorf("body leaks the file outside the static directory: %q", body)
			}
		})
	}
}

func TestNewHandlerWithoutStaticDir(t *testing.T) {
	rec := httptest.NewRecorder()
	newHandler("").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want %q", got, "application/json")
	}
	if body := rec.Body.String(); !strings.Contains(body, `"code":"not_found"`) {
		t.Errorf("body = %q, want the JSON not_found error", body)
	}
}
