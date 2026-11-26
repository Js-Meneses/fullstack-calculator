# fullstack-calculator

A calculator with a Go REST API and a React + TypeScript client. The API computes every result: the client sends one operation per step and only formats what comes back. One Docker image serves both on one port.

[![CI](https://github.com/Js-Meneses/fullstack-calculator/actions/workflows/ci.yml/badge.svg)](https://github.com/Js-Meneses/fullstack-calculator/actions/workflows/ci.yml)

## Quick start (Docker)

The only prerequisite is Docker. From the repository root:

```sh
docker build -t fullstack-calculator .
docker run --rm -p 8080:8080 fullstack-calculator
```

Open <http://localhost:8080>. Press Ctrl+C in the `docker run` terminal to stop the container; the server shuts down gracefully.

If port 8080 is taken, publish the container on another port and open <http://localhost:8081> instead:

```sh
docker run --rm -p 8081:8080 fullstack-calculator
```

## Local development

Prerequisites: Go 1.27.4, Node 24.16.0 with npm 11.13.0, and GNU Make (optional, see [Without make](#without-make)).

**Backend.** In `backend/`, start the API on <http://localhost:8080>:

```sh
make run
```

**Frontend.** In `frontend/`, install the dependencies once, then start the Vite dev server:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. The dev server proxies every `/api` request to `http://localhost:8080`, so the backend must be running and the browser sees a single origin.

**Production build without Docker.** Build the frontend, then start the backend with `STATIC_DIR` pointing at the build. In `frontend/`:

```sh
npm run build
```

Then in `backend/`, in a POSIX shell:

```sh
STATIC_DIR=../frontend/dist make run
```

Or in PowerShell, where the variable stays set for the session until you remove it:

```powershell
$env:STATIC_DIR = '../frontend/dist'; make run
Remove-Item Env:STATIC_DIR
```

The calculator is then at <http://localhost:8080>.

| Variable     | Default         | Meaning                                                                                                                                                                                   |
| ------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`       | `8080`          | Port to listen on, a decimal integer from 1 to 65535. Any other value stops the server at startup with exit status 1.                                                                     |
| `STATIC_DIR` | unset           | Directory to serve the frontend from. Unset or empty: API only. Set: `/api` paths go to the API and every other path serves files from the directory. A path that is not an existing directory stops the server at startup with exit status 1. The Docker image sets it to `/app/static`. |

## Tests and coverage

**Backend**, in `backend/`:

```sh
make test    # run all tests
make cover   # tests with coverage: per-function figures, then backend/coverage.html
```

**Frontend**, in `frontend/`:

```sh
npm run lint       # oxlint
npm test           # Vitest, once
npm run coverage   # tests with coverage: summary in the console, report in frontend/coverage/index.html
```

[`AGENTS.md`](AGENTS.md) sets the thresholds: `internal/calculator` at 100%, and each layer at 85% or more overall. CI enforces them in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- The `backend` job fails unless `internal/calculator` is at exactly 100.0% and the total is at least 85.0%.
- The `frontend` job fails through the 85% thresholds for statements, branches, functions and lines in [`frontend/vite.config.ts`](frontend/vite.config.ts).
- Each job writes a coverage table to its run summary and uploads its report as an artifact (`backend-coverage`, `frontend-coverage`).
- The `docker` job builds the image, runs it and smoke-tests the API and the served page.

## Without make

The [`backend/Makefile`](backend/Makefile) targets are plain `go` commands. Run them in `backend/`:

| Target       | Commands                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `make test`  | `go test ./...`                                                                                                      |
| `make cover` | `go test "-coverprofile=coverage.out" ./...`<br>`go tool cover "-func=coverage.out"`<br>`go tool cover "-html=coverage.out" -o coverage.html` |
| `make run`   | `go run ./cmd/server`                                                                                                |

Written with the quotes, as above, these commands work the same in PowerShell and POSIX shells. Keep the quotes: Windows PowerShell 5.1 splits an unquoted flag that contains a dot, such as `-coverprofile=coverage.out`, at the dot.

## API

One endpoint: `POST /api/v1/calculations`, with `Content-Type: application/json` and a body of at most 1024 bytes.

```json
{ "operation": "add", "operands": [2, 3] }
```

`operation` is one of `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` and `percentage` (`a * b / 100`, that is a% of b). `sqrt` takes one operand; every other operation takes two.

A success is status 200 with `{"result": <number>}`. Every error has one shape, with a machine-readable `code` and a human-readable `message`:

```json
{ "error": { "code": "division_by_zero", "message": "Division by zero is undefined." } }
```

The full contract, with every error code, is in [`backend/api/openapi.yaml`](backend/api/openapi.yaml).

The examples below are for a POSIX shell, against the server on port 8080. Each prints the response body, then the status code.

Add (200):

```sh
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[2,3]}'
```

```text
{"result":5}
200
```

Square root (200), with the full `float64` precision:

```sh
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","operands":[2]}'
```

```text
{"result":1.4142135623730951}
200
```

Division by zero (422):

```sh
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","operands":[1,0]}'
```

```text
{"error":{"code":"division_by_zero","message":"Division by zero is undefined."}}
422
```

Malformed body (400):

```sh
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add",'
```

```text
{"error":{"code":"invalid_json","message":"The request body must be a single valid JSON value."}}
400
```

Missing `Content-Type` (415). The empty `-H 'Content-Type:'` stops curl from sending its default form type:

```sh
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type:' \
  -d '{"operation":"add","operands":[2,3]}'
```

```text
{"error":{"code":"unsupported_media_type","message":"The Content-Type must be application/json."}}
415
```

`GET` on the endpoint (405, with the header `Allow: POST`):

```sh
curl -s -w '\n%{http_code}\n' http://localhost:8080/api/v1/calculations
```

```text
{"error":{"code":"method_not_allowed","message":"Only POST is allowed on this path."}}
405
```

Unknown `/api/` path (404):

```sh
curl -s -w '\n%{http_code}\n' http://localhost:8080/api/v1/nope
```

```text
{"error":{"code":"not_found","message":"No resource at this path."}}
404
```

**PowerShell.** `curl` is an alias for `Invoke-WebRequest` in Windows PowerShell 5.1, so call `curl.exe` by its full name. Use it for the requests without a body, such as the last two above: PowerShell 5.1 strips the double quotes from a JSON argument it passes to a native program. For a request with a body, use `Invoke-RestMethod`:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/calculations `
  -ContentType application/json -Body '{"operation":"add","operands":[2,3]}'
```

```text
result
------
     5
```

## Design decisions and assumptions

Each decision links to the spec section that records it and its reasons.

- **One endpoint, with the operation in the body.** `POST /api/v1/calculations` and a single handler that compares the path exactly. See [SPEC 01, Endpoint and routing](specs/01-backend-rest-api.md#endpoint-and-routing).
- **`float64`, with NaN and ±Inf as 422 errors.** A non-finite result is never returned; NaN is `undefined_result` and ±Inf is `result_out_of_range`. See [SPEC 01, Decisions](specs/01-backend-rest-api.md#decisions).
- **413 and 415.** A body over 1024 bytes and a wrong or missing `Content-Type` get their standard statuses, in the same error shape. See [SPEC 01, Decisions](specs/01-backend-rest-api.md#decisions).
- **Immediate-execution chaining, with no arithmetic in the frontend.** `2 + 3 × 4 =` is two API calls and shows `20`; even `±` on a result only flips the sign. See [SPEC 02, Scope](specs/02-frontend-calculator.md#scope) and [Transitions](specs/02-frontend-calculator.md#transitions).
- **12 significant digits on display, full precision kept.** The display rounds with `toPrecision(12)`; the state keeps the API's full `float64` for the next step. See [SPEC 02, Number formatting](specs/02-frontend-calculator.md#number-formatting).
- **The frontend owns its error messages.** It maps each error `code` to its own text and never shows the server's `message`, which may change without notice. See [SPEC 02, Error messages](specs/02-frontend-calculator.md#error-messages).
- **One image, with `STATIC_DIR` and no `index.html` fallback.** The Go server serves the built frontend from a directory; the frontend is not embedded in the binary, and unknown paths get a plain 404 because the app has no client-side routes. See [SPEC 03, Routing with `STATIC_DIR` set](specs/03-packaging-ci-docs.md#routing-with-static_dir-set).
- **Base images pinned by tag, without digests.** Easy to read and to update by hand; the `docker` CI job builds and smoke-tests every change. See [SPEC 03, Decisions](specs/03-packaging-ci-docs.md#decisions).

Assumptions:

- No authentication and no persistence: every request stands alone.
- One origin: the dev proxy and the image both serve the client and the API together, so there is no CORS.
- The UI is in English and uses `.` as the decimal point.

## Project structure

```text
.
├── .dockerignore             # keeps dependencies, builds and coverage out of the image
├── .gitattributes            # LF line endings on every platform
├── .github/workflows/        # CI (ci.yml)
├── .gitignore
├── AGENTS.md                 # project guidelines for people and agents
├── Dockerfile                # one image: API and built frontend
├── PROMPTS.md                # every prompt given to the spec skills
├── README.md
├── backend/
│   ├── api/                  # OpenAPI 3.1 description (openapi.yaml)
│   ├── cmd/server/           # main: wiring and startup only
│   ├── internal/calculator/  # pure domain logic, no HTTP or JSON
│   └── internal/httpapi/     # handlers, request/response types, error mapping
├── frontend/
│   └── src/
│       ├── api/              # typed API client and hand-written API types
│       ├── calculator/       # state, formatting and input logic, no components
│       └── components/       # React components with their CSS Modules
└── specs/                    # one spec per feature (NN-slug.md)
```

## AI-assisted workflow

The project was built with an AI coding agent, under a spec-first process:

- [`AGENTS.md`](AGENTS.md) holds the guidelines that every agent reads before it works: the fixed stack, the layout, the coverage thresholds and the commit conventions.
- Two skills in [`.claude/skills/`](.claude/skills/) drive the work: [`/spec`](.claude/skills/spec/SKILL.md) writes and revises a spec, and [`/spec-impl`](.claude/skills/spec-impl/SKILL.md) implements an approved one, one reviewed and committed step at a time. They are adapted from [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) and credited in each skill's `NOTICE.md` ([spec](.claude/skills/spec/NOTICE.md), [spec-impl](.claude/skills/spec-impl/NOTICE.md)).
- Each feature has one spec in [`specs/`](specs/). A spec starts as `Draft`, becomes `Approved` only when a human sets that status, and is marked `Implemented` when its acceptance criteria pass: [SPEC 01](specs/01-backend-rest-api.md) (backend API), [SPEC 02](specs/02-frontend-calculator.md) (frontend) and [SPEC 03](specs/03-packaging-ci-docs.md) (packaging, CI and this README).
- [`PROMPTS.md`](PROMPTS.md) is where the skills log every prompt and every answer to their questions, verbatim.
