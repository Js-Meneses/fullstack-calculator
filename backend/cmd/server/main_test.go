package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// env returns a lookup function over a fixed set of variables.
func env(vars map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		v, ok := vars[key]
		return v, ok
	}
}

func TestListenAddr(t *testing.T) {
	tests := []struct {
		name string
		vars map[string]string
		want string
	}{
		{"unset uses the default port", nil, ":8080"},
		{"empty uses the default port", map[string]string{"PORT": ""}, ":8080"},
		{"custom port", map[string]string{"PORT": "3000"}, ":3000"},
		{"lowest port", map[string]string{"PORT": "1"}, ":1"},
		{"highest port", map[string]string{"PORT": "65535"}, ":65535"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := listenAddr(env(tt.vars))
			if err != nil {
				t.Fatalf("listenAddr() error = %v, want nil", err)
			}
			if got != tt.want {
				t.Errorf("listenAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRunRejectsInvalidPort(t *testing.T) {
	for _, port := range []string{"abc", "70000", "65536", "0", "-1", "+80", " 80", "80.0", "0x50"} {
		t.Run(port, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			err := run(ctx, env(map[string]string{"PORT": port}))
			if !errors.Is(err, errInvalidPort) {
				t.Errorf("run() error = %v, want %v", err, errInvalidPort)
			}
		})
	}
}

// freePort asks the OS for a port that is free right now.
func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("find a free port: %v", err)
	}
	defer l.Close()
	return strconv.Itoa(l.Addr().(*net.TCPAddr).Port)
}

func TestRunFailsWhenPortIsInUse(t *testing.T) {
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("occupy a port: %v", err)
	}
	defer l.Close()
	port := strconv.Itoa(l.Addr().(*net.TCPAddr).Port)

	if err := run(context.Background(), env(map[string]string{"PORT": port})); err == nil {
		t.Fatal("run() error = nil, want a listen error")
	}
}

func TestRunServesAndShutsDown(t *testing.T) {
	port := freePort(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- run(ctx, env(map[string]string{"PORT": port})) }()

	url := "http://127.0.0.1:" + port + "/api/v1/calculations"
	resp := postWhenReady(t, url, `{"operation":"add","operands":[2,3]}`)
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if resp.StatusCode != http.StatusOK || string(body) != `{"result":5}` {
		t.Errorf("response = %d %s, want 200 {\"result\":5}", resp.StatusCode, body)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("run() error = %v, want nil after cancel", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("run() did not return after its context was cancelled")
	}
}

// postWhenReady retries the request until the server accepts connections.
func postWhenReady(t *testing.T, url, body string) *http.Response {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		resp, err := http.Post(url, "application/json", strings.NewReader(body))
		if err == nil {
			return resp
		}
		if time.Now().After(deadline) {
			t.Fatalf("server did not answer: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
