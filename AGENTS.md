# Calculator — Project Guidelines

Full-stack calculator: a Go REST API and a React + TypeScript client that consumes it.

## Stack (fixed)

- **Backend:** Go (latest stable), standard library only (`net/http`, `encoding/json`). No web framework, no router dependency.
- **Frontend:** React + TypeScript, Vite, CSS Modules.
- **Tests:** `go test` (table-driven, `httptest`); Vitest + React Testing Library.

## Repository layout

    backend/
      api/                  # OpenAPI 3.1 description (openapi.yaml)
      cmd/server/           # main: wiring and startup only
      internal/calculator/  # pure domain logic, no HTTP or JSON
      internal/httpapi/     # handlers, request/response types, error mapping
    frontend/
      src/
        api/                # typed API client and hand-written API types
        calculator/         # state, formatting and input logic, no components
        components/         # React components with their CSS Modules
    specs/                  # one spec per feature (NN-slug.md)

## Backend principles

- Idiomatic Go: small packages, concrete types, no interfaces unless a real boundary needs one. No hexagonal or clean-architecture layering.
- `internal/calculator` knows nothing about HTTP. It returns sentinel errors; `internal/httpapi` maps them to status codes.
- Numbers are `float64`. A result that is NaN or ±Inf is an error and is never returned to the client.
- The backend is the source of truth for validation. The frontend validates for UX only.

## API conventions

- Single endpoint: `POST /api/v1/calculations`, with the operation and operands in the JSON body.
- Every response on an `/api/` path is JSON. Errors share one shape with a machine-readable `code` and a human-readable `message`.

## Frontend principles

- Calculator state lives in a reducer/hook, separate from presentational components.
- All API calls go through one typed client module.
- Accessible and responsive: semantic buttons, keyboard input, visible focus, usable from 320px wide.

## Testing

- Every implementation step ships with its tests.
- Coverage: `internal/calculator` at 100%, overall at 85% or higher on both layers.
- Frontend tests assert user-visible behavior, not implementation details.

## Conventions

- English everywhere: code, comments, commits, specs, docs.
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), one logical change per commit.
- Scope is the approved spec. No speculative features, no dead code.