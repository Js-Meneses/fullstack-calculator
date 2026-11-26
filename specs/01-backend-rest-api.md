# SPEC 01 — Backend REST API

> **Status:** Approved
> **Depends on:** None
> **Date:** 2026-11-26
> **Objective:** A Go service that computes the seven calculator operations through `POST /api/v1/calculations` and answers every failure with one JSON error shape.

## Scope

**In:**

- Go module `github.com/Js-Meneses/fullstack-calculator/backend` in `backend/`, standard library only.
- Domain package `internal/calculator` with the operations `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` and `percentage`.
- HTTP package `internal/httpapi` with the single endpoint, request validation, error mapping and JSON 404 and 405 responses.
- Server entry point `cmd/server`: port from `PORT`, server timeouts, graceful shutdown.
- Table-driven unit tests for `internal/calculator`, `httptest` tests for `internal/httpapi`, tests for the startup code in `cmd/server`.
- `backend/Makefile` with the targets `test`, `cover` and `run`.
- OpenAPI 3.1 description at `backend/api/openapi.yaml`.

**Out of scope:**

- Frontend.
- Docker, CI, CORS and a health endpoint.
- Persistence and authentication.
- Parsing full expressions such as `2 + 3 * 4`.
- Rounding or formatting results. The API returns the raw `float64`.
- Request or access logging. The server logs only startup, shutdown and fatal errors.

## Data model

### Endpoint and routing

The API has one resource: `POST /api/v1/calculations`. A single handler compares `r.URL.Path` exactly. The query string is ignored.

Checks run in this order. The first one that fails decides the response.

| Order | Check                                                                             | Failure                              |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------ |
| 1     | The path is exactly `/api/v1/calculations` (no trailing slash, case-sensitive).   | 404 `not_found`                      |
| 2     | The method is `POST`. `HEAD` and `OPTIONS` are not special.                       | 405 `method_not_allowed`             |
| 3     | `Content-Type` parses as media type `application/json`. Parameters are ignored.   | 415 `unsupported_media_type`         |
| 4     | The body is at most 1024 bytes. It is read in full before parsing.                | 413 `body_too_large`                 |
| 5     | The body is exactly one JSON value, optionally surrounded by whitespace.          | 400 `invalid_json`                   |
| 6     | That value matches the request shape below.                                       | 400 `invalid_request`                |
| 7     | The domain accepts the operation and its operands.                                | 400 or 422, see the error table      |

A body of exactly 1024 bytes is processed. A body of 1025 bytes or more returns 413, whatever its content. A missing `Content-Type` returns 415. `application/json; charset=utf-8` is accepted. If reading the body fails (for example, the client drops the connection), the response is 500 `internal_error`.

### Request

    { "operation": "add", "operands": [2, 3] }

| Field        | Type                 | Rule                                                                              |
| ------------ | -------------------- | --------------------------------------------------------------------------------- |
| `operation`  | string               | Required, not `null`. Case-sensitive. An unlisted value is a domain error.        |
| `operands`   | array of numbers     | Required, not `null`. No element may be `null`. Its length is a domain error.     |

These bodies return 400 `invalid_request`:

- A top-level value that is not an object, including `null`.
- A missing or `null` `operation` or `operands`.
- A field with the wrong JSON type, such as `"operands": [1, "2"]` or `"operation": 5`.
- A `null` element inside `operands`.
- A number outside the `float64` range, such as `1e400`.
- Any field other than `operation` and `operands`.

Field names match case-insensitively and a repeated key keeps its last value, as `encoding/json` does.

These bodies return 400 `invalid_json`: an empty body, a whitespace-only body, a syntax error, and any non-whitespace data after the first JSON value (for example `{"operation":"add","operands":[1,2]}{}`).

### Operations

The domain entry point is `calculator.Calculate(operation string, operands []float64) (float64, error)`.

| `operation`  | Operands | Result                          | Domain error before computing              |
| ------------ | -------- | ------------------------------- | ------------------------------------------ |
| `add`        | 2        | `a + b`                         | none                                       |
| `subtract`   | 2        | `a - b`                         | none                                       |
| `multiply`   | 2        | `a * b`                         | none                                       |
| `divide`     | 2        | `a / b`                         | `b` is `0` or `-0` → `ErrDivisionByZero`   |
| `power`      | 2        | `math.Pow(a, b)`                | `a` is `0` or `-0` and `b < 0` → `ErrDivisionByZero` |
| `sqrt`       | 1        | `math.Sqrt(a)`                  | `a < 0` → `ErrNegativeSquareRoot`          |
| `percentage` | 2        | `a * b / 100` (a% of b)         | none                                       |

`Calculate` checks in this order:

1. The operation is in the table, or `ErrUnknownOperation`.
2. The operand count matches the table, or `ErrOperandCount`.
3. The operation's own check from the last column.
4. The result is computed, then:
   - NaN → `ErrUndefinedResult` (for example `power` of `-8` and `0.5`).
   - `+Inf` or `-Inf` → `ErrOutOfRange` (for example `multiply` of `1e308` and `10`).
   - `-0` → `0`.

Underflow to zero is not an error: `power` of `2` and `-2000` returns `0`.

Sentinel errors, all exported from `internal/calculator`:
`ErrUnknownOperation`, `ErrOperandCount`, `ErrDivisionByZero`, `ErrNegativeSquareRoot`, `ErrOutOfRange`, `ErrUndefinedResult`.

### Responses

Every response has the header `Content-Type: application/json`.

Success, status 200:

    { "result": 5 }

Error, every non-200 status:

    { "error": { "code": "division_by_zero", "message": "Division by zero is undefined." } }

Clients branch on `code`. The `message` is fixed per code and may change without notice.

| Status | `code`                   | Trigger                                          | `message`                                                                                              |
| ------ | ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_json`           | Routing check 5                                  | `The request body must be a single valid JSON value.`                                                  |
| 400    | `invalid_request`        | Routing check 6                                  | `The request body must be an object with a string "operation" and an array of numbers "operands".`    |
| 400    | `unknown_operation`      | `ErrUnknownOperation`                            | `Unknown operation. Use one of: add, subtract, multiply, divide, power, sqrt, percentage.`             |
| 400    | `invalid_operand_count`  | `ErrOperandCount`                                | `Wrong number of operands: sqrt takes 1, every other operation takes 2.`                               |
| 404    | `not_found`              | Routing check 1                                  | `No resource at this path.`                                                                            |
| 405    | `method_not_allowed`     | Routing check 2, with header `Allow: POST`       | `Only POST is allowed on this path.`                                                                   |
| 413    | `body_too_large`         | Routing check 4                                  | `The request body must not exceed 1024 bytes.`                                                         |
| 415    | `unsupported_media_type` | Routing check 3                                  | `The Content-Type must be application/json.`                                                           |
| 422    | `division_by_zero`       | `ErrDivisionByZero`                              | `Division by zero is undefined.`                                                                       |
| 422    | `negative_square_root`   | `ErrNegativeSquareRoot`                          | `The square root of a negative number is not a real number.`                                           |
| 422    | `result_out_of_range`    | `ErrOutOfRange`                                  | `The result is too large to represent.`                                                                |
| 422    | `undefined_result`       | `ErrUndefinedResult`                             | `The result is not a real number.`                                                                     |
| 500    | `internal_error`         | Any error the mapping does not know, such as a failure reading the body | `Internal server error.`                                                                |

### Server configuration

| Setting             | Value                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `PORT`              | Decimal integer from 1 to 65535. Empty or unset means `8080`. Any other value: the server logs the error and exits with status 1. |
| Listen address      | `:` followed by the port, on all interfaces.                                               |
| `ReadHeaderTimeout` | 5 s                                                                                        |
| `ReadTimeout`       | 10 s                                                                                       |
| `WriteTimeout`      | 10 s                                                                                       |
| `IdleTimeout`       | 60 s                                                                                       |
| Shutdown            | On `os.Interrupt` or `syscall.SIGTERM`, stop accepting connections and wait up to 10 s for in-flight requests. Exit 0 on a clean shutdown, 1 if the wait times out. |
| Logging             | `log/slog` text handler on stderr. One line on start (with the address), one on shutdown, one per fatal error. |

`cmd/server/main.go` keeps `main` to a call to a `run` function that receives a context and the environment lookup, so tests can start and stop the server.

### Makefile

`backend/Makefile`, run from `backend/`. All targets are `.PHONY`.

| Target  | Commands                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| `test`  | `go test ./...`                                                                                                     |
| `cover` | `go test -coverprofile=coverage.out ./...`, then `go tool cover -func=coverage.out`, then `go tool cover -html=coverage.out -o coverage.html` |
| `run`   | `go run ./cmd/server`                                                                                               |

`coverage.out` and `coverage.html` are already in `.gitignore`.

## Implementation plan

1. **Domain operations.** Create the module with `go.mod` declaring `go 1.27.4` and no dependencies. Add `Calculate` and the six sentinel errors as described in Operations. Table-driven tests cover every operation, every domain error, the NaN, ±Inf and `-0` rules, and underflow. Add the Makefile with the `test` and `cover` targets.
   - Files: `backend/go.mod`, `backend/internal/calculator/calculator.go`, `backend/internal/calculator/calculator_test.go`, `backend/Makefile`
   - Verify: in `backend/`, `make test` passes and `go test -cover ./internal/calculator/` prints `coverage: 100.0% of statements`.
   - Commit: `feat(calculator): add operations and sentinel errors`
2. **Calculations endpoint.** Add `httpapi.NewHandler() http.Handler` with routing checks 1 and 2, check 5 with `json.Valid` (which also rejects trailing data), decoding with `encoding/json`, the request shape rules for missing fields and wrong types, the call to `Calculate`, the success response and every row of the error table except 413 and 415. The error table's domain rows and its 500 fallback live in one unexported function in `errors.go`, `mapError(err error) (status int, code, message string)`. `httptest` tests cover a success per operation, `-0` returned as `0`, every domain error code, `invalid_json` for empty, malformed and trailing-data bodies, `invalid_request` for missing fields and wrong types, 404 and 405 with `Allow: POST`, a body read failure returning 500 `internal_error`, and the `Content-Type` header on every response. A test in `errors_test.go`, in package `httpapi`, passes an unknown error (`errors.New("unexpected")`) to `mapError` and asserts status 500 and code `internal_error`.
   - Files: `backend/internal/httpapi/handler.go`, `backend/internal/httpapi/request.go`, `backend/internal/httpapi/errors.go`, `backend/internal/httpapi/handler_test.go`, `backend/internal/httpapi/errors_test.go`
   - Verify: in `backend/`, `go test ./internal/httpapi/` passes.
   - Commit: `feat(httpapi): add calculations endpoint and error mapping`
3. **Strict request checks.** Add routing checks 3 and 4 with their two error rows, and the rejection of unknown fields and `null` operand elements. Tests cover a missing and a wrong `Content-Type`, `application/json; charset=utf-8` accepted, bodies of 1024 and 1025 bytes, an unknown field, `[1, null]`, `"operands": null` and `1e400`.
   - Files: `backend/internal/httpapi/request.go`, `backend/internal/httpapi/errors.go`, `backend/internal/httpapi/handler_test.go`
   - Verify: in `backend/`, `go test -cover ./internal/httpapi/` passes with at least 85% coverage.
   - Commit: `feat(httpapi): enforce content type, body size and strict JSON`
4. **Server.** Add `cmd/server` with `run`, the `PORT` rules, the timeouts, graceful shutdown and logging from Server configuration. Tests cover the default port, an invalid `PORT`, and a server that answers a request and returns cleanly when its context is cancelled. Add the `run` target to the Makefile.
   - Files: `backend/cmd/server/main.go`, `backend/cmd/server/main_test.go`, `backend/Makefile`
   - Verify: in `backend/`, `make cover` passes and its `total:` line is at least 85.0%. Then `make run`, and in a second PowerShell window `Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/calculations -ContentType application/json -Body '{"operation":"add","operands":[2,3]}'` prints `result` `5`. Ctrl+C in the first window logs the shutdown line and the process ends.
   - Commit: `feat(server): add HTTP server with timeouts and graceful shutdown`
5. **OpenAPI description.** Write `backend/api/openapi.yaml` in OpenAPI 3.1: the one path and operation, the request schema (`operation` as an enum of the seven names, `operands` as an array of 1 to 2 numbers, both required, no additional properties), the 200 response, a shared `Error` schema with `code` as an enum of every code in the error table, and the responses 400, 405, 413, 415, 422 and 500. The 404 behaviour is described in `info.description`. The server URL is `http://localhost:8080`. The document declares `security: []` because the API has no authentication. Add `api/` to the backend part of the layout in `AGENTS.md`.
   - Files: `backend/api/openapi.yaml`, `AGENTS.md`
   - Verify: from the repository root, `npx @redocly/cli@2.84.0 lint backend/api/openapi.yaml` exits with status 0.
   - Commit: `docs(api): add OpenAPI 3.1 description`

## Acceptance criteria

- [ ] `backend/go.mod` declares `module github.com/Js-Meneses/fullstack-calculator/backend` and `go 1.27.4`, and has no `require` lines.
- [ ] In `backend/`, `go vet ./...` prints nothing and `gofmt -l .` prints nothing.
- [ ] In `backend/`, `go test -cover ./internal/calculator/` reports `coverage: 100.0% of statements`.
- [ ] In `backend/`, `make cover` passes and its `total:` line reports at least 85.0%.
- [ ] `go test -v ./internal/httpapi/` shows a passing case for every row of the error table, and one success case per operation. The `internal_error` case calls `mapError` directly with an unknown error and asserts status 500 and code `internal_error`.
- [ ] A test asserts that `{"operation":"multiply","operands":[-1,0]}` returns 200 with the body `{"result":0}`.
- [ ] A test asserts that `{"operation":"percentage","operands":[50,10]}` returns 200 with `result` `5`.
- [ ] A test asserts that `{"operation":"power","operands":[-8,0.5]}` returns 422 `undefined_result`.
- [ ] A test asserts that `{"operation":"power","operands":[0,-1]}` returns 422 `division_by_zero`.
- [ ] A test asserts that a body of exactly 1024 bytes is processed and a body of 1025 bytes returns 413 `body_too_large`.
- [ ] A test asserts that `{"operation":"add","operands":[1,null]}` returns 400 `invalid_request`.
- [ ] A test asserts that an invalid `PORT` such as `abc` or `70000` makes `run` return an error.
- [ ] From the repository root, `npx @redocly/cli@2.84.0 lint backend/api/openapi.yaml` exits with status 0.
- [ ] (manual) With `make run` active, `curl.exe -i http://localhost:8080/nope` shows status 404, `Content-Type: application/json` and the `not_found` code.
- [ ] (manual) With `make run` active, Ctrl+C logs the shutdown line and the process exits.

## Decisions

- **Yes:** 415 for a wrong or missing `Content-Type` and 413 for a body over 1024 bytes. Standard HTTP meaning, same JSON shape. (asked)
- **No:** 400 for every client error. It hides two distinct, well-known conditions behind one status.
- **Yes:** exactly two operands for `add` and `multiply`. One arity per operation, like a button calculator. (asked)
- **No:** variadic `add` and `multiply`. It adds a second arity rule that the client does not need.
- **Yes:** raw `float64` results, no rounding. Display formatting belongs to the frontend spec. (asked)
- **Yes:** lint the OpenAPI file with Redocly CLI 2.84.0 through `npx`. Node 24 is installed, and nothing is added to the Go module. (asked)
- **Yes:** operations, arity and their errors live in `internal/calculator`. The HTTP layer only maps sentinel errors, so the list of operations has one home. (default, not asked)
- **Yes:** fixed error codes and messages as in the error table, with `invalid_json` for unparseable bodies and `invalid_request` for parseable bodies of the wrong shape. (default, not asked)
- **Yes:** `power` with a zero base and a negative exponent returns `division_by_zero`, not `result_out_of_range`. It is a division by zero in disguise. (default, not asked)
- **Yes:** NaN maps to `undefined_result` and ±Inf to `result_out_of_range`, both 422. The request was well-formed; the math has no finite answer. (default, not asked)
- **Yes:** `percentage` computes `a * b / 100` in that order, as the request states. It keeps `7% of 3` at `0.21`; `a / 100 * b` gives `0.21000000000000002`. (default, not asked)
- **Yes:** operands are decoded as pointers so a `null` element is detected. `encoding/json` would otherwise turn it into `0` silently. (default, not asked)
- **Yes:** the body is read in full, up to 1025 bytes, before parsing. The 413 then wins over a syntax error in the same body, so the result does not depend on where the error sits. (default, not asked)
- **Yes:** one handler that compares the path exactly, not `http.ServeMux`. `ServeMux` answers unclean paths with a plain-text redirect and method mismatches with a plain-text 405. (default, not asked)
- **Yes:** case-insensitive field names and last-wins duplicate keys, as `encoding/json` does. Rejecting them needs a custom decoder for no user benefit. (default, not asked)
- **Yes:** a 500 `internal_error` fallback for an error the mapping does not know. The only request that reaches it is one whose body cannot be read, so a test in package `httpapi` also passes an unknown error straight to `mapError`. (fallback: default, not asked; test: asked in revision)
- **Yes:** a failure reading the request body returns 500 `internal_error` through the fallback, and a handler test asserts it. (asked during implementation)
- **Yes:** check 5 uses `json.Valid`, which is exactly "one JSON value, optionally surrounded by whitespace". It rejects trailing data as `invalid_json` from step 2, not step 3 as first planned. (asked during implementation)
- **Yes:** the error mapping is the unexported function `mapError` in `errors.go`, tested from package `httpapi` rather than `httpapi_test` so the test can call it. (default, not asked)
- **Yes:** the timeout and shutdown values in Server configuration. Requests are tiny, so these limits never bind in normal use. (default, not asked)
- **Yes:** Makefile recipes are plain `go` commands, so they run the same under `sh` and `cmd.exe` with GNU Make on Windows. (default, not asked)
- **Yes:** a root `.gitattributes` with `* text=auto eol=lf`, committed on its own before step 2. With `core.autocrlf=true`, a Windows clone would otherwise check out CRLF Go files, and `gofmt -l` lists those as unformatted. (asked during implementation)

## Risks

| Risk                                                                                         | Mitigation                                                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| In Windows PowerShell 5.1, `curl` is an alias of `Invoke-WebRequest` and strips quotes in JSON arguments. | Manual checks use `Invoke-RestMethod` for JSON bodies and `curl.exe` only for requests without a body. |
| `percentage` overflows in `a * b` when the true result still fits, for example `1e307` and `1000`. | Accepted. It returns 422 `result_out_of_range`; such inputs are far outside calculator use.         |
| Picking a free port in the `run` test can race with another process.                         | The test asks the OS for a free port immediately before starting the server.                       |
