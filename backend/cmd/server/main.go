// Command server runs the calculator HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/httpapi"
)

const (
	defaultPort     = "8080"
	shutdownTimeout = 10 * time.Second
)

var errInvalidPort = errors.New("must be a decimal integer from 1 to 65535")

func main() {
	if err := run(context.Background(), os.LookupEnv); err != nil {
		os.Exit(1) // run has already logged the error
	}
}

// run starts the server and blocks until ctx is cancelled or the process
// receives an interrupt or SIGTERM, then shuts down gracefully. Any error it
// returns has already been logged.
func run(ctx context.Context, lookupEnv func(string) (string, bool)) (err error) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	defer func() {
		if err != nil {
			logger.Error("server failed", "error", err)
		}
	}()

	addr, err := listenAddr(lookupEnv)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}

	srv := &http.Server{
		Handler:           httpapi.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(listener) }()
	logger.Info("server started", "addr", addr)

	select {
	case err := <-serveErr:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	logger.Info("server shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}

// listenAddr returns the address to listen on, on all interfaces, from the
// PORT variable. Empty or unset means 8080; anything other than a decimal
// integer from 1 to 65535 is an error.
func listenAddr(lookupEnv func(string) (string, bool)) (string, error) {
	port, _ := lookupEnv("PORT")
	if port == "" {
		return ":" + defaultPort, nil
	}

	n, err := strconv.ParseUint(port, 10, 16)
	if err != nil || n == 0 {
		return "", fmt.Errorf("invalid PORT %q: %w", port, errInvalidPort)
	}
	return ":" + strconv.FormatUint(n, 10), nil
}
