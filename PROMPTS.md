# Prompts

## 2026-11-26 — /spec → specs/01-backend-rest-api.md

**Prompt**

> /spec Backend REST API for the calculator. A Go service (module path github.com/Js-Meneses/fullstack-calculator/backend, standard library only) exposing POST /api/v1/calculations. Request: {"operation": "add", "operands": [2, 3]}. Success: 200 {"result": 5}. Errors: {"error": {"code": "division_by_zero", "message": "..."}}, with 400 for a malformed or invalid request and 422 for a well-formed request whose math is undefined. Operations: add, subtract, multiply, divide, power, sqrt, percentage (percentage(a, b) = a% of b = a * b / 100). Edge cases to cover: division by zero, square root of a negative number, overflow and NaN results, malformed JSON, unknown fields, trailing data, null operands, unknown operation, wrong number of operands, wrong content type, a body over 1024 bytes, and unknown paths or methods (JSON 404 and 405). A result of -0 is normalized to 0. The port comes from the PORT variable (default 8080), with server timeouts and graceful shutdown. Include table-driven unit tests for the domain package and httptest tests for the handlers, a Makefile with test, cover and run targets, and an OpenAPI 3.1 description at backend/api/openapi.yaml. Out of scope: frontend, Docker, CI, CORS, health endpoint, persistence, authentication, and parsing of full expressions.

**Clarifications**

1. **Status for a wrong Content-Type and a body over 1024 bytes?** → 415 and 413 (Recommended)
2. **How many operands should add and multiply accept?** → Exactly 2 (Recommended)
3. **Should the backend round results?** → Raw float64 (Recommended)
4. **How should backend/api/openapi.yaml be checked?** → Redocly lint via npx (Recommended)

## 2026-11-26 — /spec 01 (revision)

**Prompt**

> /spec 01 Cover the internal_error fallback with a test: in step 2, add a test in package httpapi that passes an unknown error to the error-mapping function and asserts status 500 and code internal_error. Update acceptance criterion 5 and the matching decision so they no longer say that no test triggers it.

**Changes**

- Step 2 names the error-mapping function `mapError(err error) (status int, code, message string)` in `errors.go`, adds a test in `errors_test.go` (package `httpapi`) that passes `errors.New("unexpected")` to it and asserts status 500 and code `internal_error`, and lists `errors_test.go` in its files.
- Acceptance criterion 5 now covers every row of the error table, with the `internal_error` case checked through a direct call to `mapError`.
- The `internal_error` decision now says the fallback is covered by a direct test of `mapError` instead of saying no test triggers it.
- New decision (default, not asked): the mapping is the unexported `mapError`, tested from package `httpapi` so the test can call it.

## 2026-11-26 — /spec-impl 01-backend-rest-api

**Prompt**

> /spec-impl @specs/01-backend-rest-api.md

**Decisions during implementation**

- Step 2: `json.Valid` already rejects trailing data, which the plan placed in step 3; and `.gitattributes` for LF line endings, since `gofmt -l` flags CRLF files on a Windows clone with `core.autocrlf=true`.
  > Go with (a) for both. Also state in the spec that a body read failure returns 500 internal_error, since the tests now assert it. Commit .gitattributes as its own chore commit, then commit step 2.
- Step 3: Content-Type matching is case-insensitive and ignores malformed parameters; recorded in the spec's Decisions.
  > Yes, add the Decisions line, stage it with this step and commit. and continue
- Close: criterion 15 (Ctrl+C logs the shutdown line and the process exits) was checked by the user; the spec is confirmed done.
  > Ctrl+C works, yes the spec is done
