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

## 2026-11-26 — /spec → specs/02-frontend-calculator.md

**Prompt**

> /spec Frontend for the calculator: a React + TypeScript single-page app (Vite, CSS Modules, no UI or state library) that consumes the existing POST /api/v1/calculations endpoint described in backend/api/openapi.yaml and specs/01-backend-rest-api.md. A pocket-calculator UI: a display and a keypad with digits, decimal point, sign toggle, the seven backend operations, equals, clear and backspace, usable with mouse, touch and keyboard. The frontend never does arithmetic: every result comes from the API. Behaviour: immediate-execution chaining (2 + 3 × 4 = gives 20, one API call per step); square root applies at once to the displayed number; percentage is a binary operator (10 % 200 = gives 20); entry is limited to 12 digits with one decimal point and no leading zeros; results are displayed rounded to 12 significant digits while the full value is kept in state; the keypad is inactive while a request is pending; each backend error code maps to its own user-facing message, plus one generic message for network failures; division by zero is not blocked on the client. Keyboard: digits, + - * /, p or ^ for power (^ is a dead key on some layouts), r for square root, n for sign toggle, Enter always means equals (Space activates the focused button), Escape clears, Backspace deletes. Calculator state lives in a pure reducer behind a hook, and all API calls go through one typed client module that never rejects and returns a discriminated union; API types are written by hand. Responsive from 320px wide and accessible. Include unit tests for the reducer and the client (fetch replaced with Vitest utilities), component tests for the main flows, and coverage thresholds of 85%. Development uses a Vite proxy from /api to http://localhost:8080, so no CORS. Keep the linter the Vite template ships with. Out of scope: Docker, CI, serving the built frontend from Go, calculation history, and the project README.

**Clarifications**

1. **What should '2 + =' and a repeated '=' do?** → Both no-ops (Recommended)
2. **How should ± flip the sign of a value that came from the API?** → Flip sign locally (Recommended)
3. **After an API error, what should the next key do?** → Any entry key recovers (Recommended)
4. **Should Clear stay active to abort a pending request, and with what timeout?** → Clear aborts; 10 s timeout (Recommended)
5. **Which extra keys should also work?** → % → percentage (Recommended), = → equals (Recommended), Delete → backspace, . and , → decimal point (Recommended)
6. **Display format for rounded results?** → Plain, e-notation (Recommended)
7. **Show the pending operation above the number and highlight the operator key?** → Both (Recommended)

## 2026-11-26 — /spec-impl 02-frontend-calculator

**Prompt**

> /spec-impl @specs/02-frontend-calculator.md

**Decisions during implementation**

- Step 3: returning to the initial state (`clear`, error recovery, an error response) would reset `nextId` to 0, so a late response could match the next request in the reducer.
  > Keep nextId (Recommended)
- Step 3: the longest-entry example `-123456789012.` contradicts the rule that ignores the point at 12 digits, and "more than six leading zeros" contradicts the `0.0000001` example.
  > Fix the example (Recommended); Say "six or more" (Recommended)
- Close: the acceptance check showed that the Vite proxy answers 502 (not a plain-text 500) with the backend down, and that StrictMode does not double requests per step; both sentences in the spec were corrected. The spec is confirmed done.
  > yes, fix both sentences and close it

## 2026-11-26 — /spec → specs/03-packaging-ci-docs.md

**Prompt**

> /spec Packaging, CI and documentation for the calculator. 1) Container: a single multi-stage Dockerfile at the repo root (pinned base images: Node 24 alpine, Go alpine matching backend/go.mod, gcr.io/distroless/static-debian13:nonroot) that builds the React frontend and the Go backend into one small non-root image where the Go server serves both the API and the built frontend on one port, so `docker build` plus `docker run` is all a reviewer needs. Add a .dockerignore that keeps node_modules, build output, coverage and .git out of the build context. This needs a small backend change: when the STATIC_DIR variable is set, the server also serves the files in that directory on non-API paths; /api/ paths keep their JSON behaviour (including JSON 404 and 405), unknown non-API paths return a plain 404 with no index.html fallback, and with the variable unset the server stays API-only. The frontend is not embedded in the binary. Update any sentence in AGENTS.md, backend/api/openapi.yaml and specs that says every response is JSON so that it applies to the API paths. No HEALTHCHECK. 2) CI: a GitHub Actions workflow on push to main and on pull requests with three jobs: backend (vet, gofmt check, tests, coverage, and a gate that fails unless internal/calculator is at 100% and the total is at least 85%), frontend (lint, tests with coverage, build), and docker (build the image, run it, and smoke-test the API success and error paths and the served page). Coverage reports are uploaded as artifacts and summarized in the job summary; no third-party services. 3) README at the repo root with: overview and CI badge, quick start with Docker, local development for backend and frontend, tests and coverage, commands for systems without make, API usage with curl examples for success and error cases, design decisions and assumptions linked to the specs, project structure, and the AI-assisted workflow (specs, AGENTS.md, the skills in .claude/skills adapted from Klerith/fernando-skills and credited in each skill's NOTICE.md) linking to the existing PROMPTS.md. No screenshots or other binary assets. Out of scope: cloud deployment, docker compose, HTTPS, editing PROMPTS.md by hand, and new calculator features.

**Clarifications**

1. **How strictly to pin base images and GitHub Actions?** → Exact tags, major action tags
2. **What do non-GET/HEAD requests get on non-API paths with STATIC_DIR set?** → 405 for every non-API path
3. **What if STATIC_DIR is set but is not an existing directory?** → Fail at startup (Recommended)
4. **How to write the README's API examples for PowerShell users?** → curl + PowerShell note (Recommended)

## 2026-11-26 — /spec 03 (revision)

**Prompt**

> /spec 03 Four corrections. 1) Backend job step 5: the step must fail when go test fails even though its output is also saved to a file; say how (shell: bash, which sets pipefail, or set -o pipefail before the pipe), because the default run shell has no pipefail and tee would hide the failure. 2) README "Without make": go flags that contain a dot are split by Windows PowerShell 5.1, so show them quoted, which works in both shells: go test "-coverprofile=coverage.out" ./..., go tool cover "-func=coverage.out", go tool cover "-html=coverage.out" -o coverage.html. Keep the claim that the commands work the same in PowerShell and POSIX shells only for the quoted form. 3) Content types: on Windows, Go's mime package reads the registry, and this machine maps .js to application/javascript, so the text/javascript rule holds in the Linux image, not on every development machine. Say so in the routing rules, make static_test.go assert Content-Type only for index.html (text/html; charset=utf-8), and leave the JavaScript type to smoke check 6. 4) The acceptance criterion with git grep -i "every response" also matches the step 2 sentence of SPEC 01 ("the Content-Type header on every response"), which is not reworded; drop -i so it matches only the three sentences that start with "Every response".

**Changes**

- Backend job step 5 pipes `go test` through `tee` with `shell: bash`, which GitHub runs as `bash -eo pipefail`, and says why the default `run` shell would hide a failure.
- README "Without make" row: the three dotted flags are quoted, and the claim that the commands work the same in PowerShell and POSIX shells applies to the quoted form only. New acceptance criterion checks the quotes.
- Routing rules: `Content-Type` comes from Go's `mime` package, the listed types hold in the Linux image, and Windows can override them through the registry (`.js` as `application/javascript` on this machine). Step 1's `static_test.go` asserts `Content-Type` only for `index.html`, as `text/html; charset=utf-8`; the `.js` type is left to smoke check 6.
- The wording criterion uses `git grep -n "Every response"` without `-i`, and expects exactly three lines, one per file, each starting with `Every response on an /api/ path`. The OpenAPI rewording now gives that exact sentence instead of "Scoped to /api and /api/ paths", so the criterion can match it.
