# SPEC 03 — Packaging, CI and documentation

> **Status:** Approved
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-11-26
> **Objective:** One Docker image that serves the API and the built frontend on one port, a GitHub Actions workflow that tests, measures and smoke-tests it, and a README that lets a reviewer run and understand the project.

## Scope

**In:**

- Optional static file serving in the Go server, switched on by the `STATIC_DIR` variable. With the variable unset, the server is API-only, as today.
- A multi-stage `Dockerfile` and a `.dockerignore` at the repository root.
- The workflow `.github/workflows/ci.yml` with the jobs `backend`, `frontend` and `docker`, coverage artifacts and job summaries.
- `README.md` at the repository root.
- Rewording the sentences in `AGENTS.md`, `backend/api/openapi.yaml` and `specs/01-backend-rest-api.md` that say every response is JSON, so they apply to the API paths.
- The `json-summary` coverage reporter in `frontend/vite.config.ts`, which the frontend job summary reads.

**Out of scope:**

- Cloud deployment, image publishing to a registry, docker compose and HTTPS.
- A `HEALTHCHECK` in the image and a health endpoint in the API.
- Embedding the frontend in the Go binary.
- A fallback to `index.html` for unknown paths (single-page-app routing). The frontend has one page and no client-side routes.
- Third-party CI services: coverage badges, Codecov and the like.
- Linting `backend/api/openapi.yaml` in CI.
- New Makefile targets and a root Makefile.
- Screenshots and any other binary asset.
- Editing `PROMPTS.md` by hand.
- New calculator features.

## Data model

### `STATIC_DIR`

A new server setting, read in `run` through the same environment lookup as `PORT`.

| Value                                        | Behaviour                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unset or empty                               | API-only. The server's handler is `httpapi.NewHandler()`, exactly as in SPEC 01.                             |
| A path to an existing directory              | The server serves the API and the files in that directory, as in Routing below. A relative path is resolved against the working directory. |
| Anything else (missing path, a regular file) | `run` logs the error and returns it, so the process exits with status 1. Nothing listens.                   |

`run` checks `PORT` first, then `STATIC_DIR`, both before it opens the listener. The new sentinel error is `errInvalidStaticDir` with the text `must be an existing directory`, wrapped with the value as `invalid STATIC_DIR "<value>": must be an existing directory`, the same pattern as `errInvalidPort`.

The start log line gains the attribute `static_dir` with the value of `STATIC_DIR` when it is set. Nothing else in Server configuration (SPEC 01) changes.

### Routing with `STATIC_DIR` set

The path is `r.URL.Path`, compared without `http.ServeMux`. The first matching row decides the response.

| Order | Condition                                                                 | Response                                                                                                  |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | The path is `/api` or starts with `/api/` (case-sensitive).               | `httpapi.NewHandler()`, unchanged: JSON responses, including its 404 `not_found` and 405 `method_not_allowed`. |
| 2     | The method is not `GET` or `HEAD`.                                        | 405, header `Allow: GET, HEAD`, `Content-Type: text/plain; charset=utf-8`, body `Method Not Allowed`.     |
| 3     | The path names a regular file in `STATIC_DIR`.                            | 200 with the file, through `http.FileServer`.                                                             |
| 4     | The path names a directory in `STATIC_DIR` that contains `index.html`.    | 200 with that `index.html`. In practice this is `/`.                                                      |
| 5     | Anything else: a missing path, or a directory without `index.html`.       | 404, `Content-Type: text/plain; charset=utf-8`, body `404 page not found`.                                |

Rules that follow from `http.FileServer` and are kept as they are:

- `Content-Type` comes from the file extension through Go's `mime` package. In the Linux image that gives `text/html; charset=utf-8` for `.html`, `text/javascript; charset=utf-8` for `.js`, `text/css; charset=utf-8` for `.css` and `image/svg+xml` for `.svg`. On Windows the package also reads the registry, which can override these: the machine this spec was written on maps `.js` to `application/javascript`. So the `.js` type is checked only in the image, by smoke check 6, and `static_test.go` asserts the `Content-Type` of a served file only for `index.html`.
- `Last-Modified`, conditional requests and `Range` work as `http.FileServer` implements them. No `Cache-Control` header is added.
- `GET /index.html` answers 301 with `Location: ./`.
- The path is cleaned before the lookup, so `..` segments never reach a file outside `STATIC_DIR`.
- Directory listings are never produced. The filesystem passed to `http.FileServer` reports a directory without `index.html` as not existing, which gives row 5.

### Code layout

| File                                   | Content                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `backend/cmd/server/static.go`         | `newHandler(staticDir string) http.Handler`: returns `httpapi.NewHandler()` when `staticDir` is empty, otherwise the routing table above. Also the filesystem wrapper that hides directories without `index.html`. |
| `backend/cmd/server/static_test.go`    | `httptest` tests of `newHandler` against a `t.TempDir()` holding `index.html`, `assets/app.js` and an empty directory `assets/empty/`. |
| `backend/cmd/server/main.go`           | Reads and validates `STATIC_DIR`, passes it to `newHandler`, logs `static_dir`. The package comment mentions the frontend. |

`internal/httpapi` does not change.

### Docker image

`Dockerfile` at the repository root, three stages. The build context is the repository root.

| Stage      | Base image                                  | Work                                                                                                                                                  |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend` | `node:24.16.0-alpine`                       | In `/src/frontend`: copy `package.json` and `package-lock.json`, run `npm ci`, copy the rest of `frontend/`, run `npm run build`. Output: `/src/frontend/dist`. |
| `backend`  | `golang:1.27.4-alpine`                      | In `/src/backend`: copy `go.mod`, then the rest of `backend/`, then `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server`. |
| final      | `gcr.io/distroless/static-debian13:nonroot` | Copy `/out/server` to `/app/server` and `dist` to `/app/static`. `ENV STATIC_DIR=/app/static`. `EXPOSE 8080`. `USER nonroot:nonroot`. `ENTRYPOINT ["/app/server"]`. |

- Base images are pinned by exact tag, without digests. The distroless image has no version tag, so `:nonroot` is the pin.
- The Go tag matches the `go 1.27.4` line in `backend/go.mod`. The Node tag matches the Node version in SPEC 02 Tooling.
- `PORT` is not set in the image, so the server listens on 8080. `docker run -e PORT=...` still overrides it.
- No stage runs tests or the linter. CI does that.

The image name used everywhere (README, CI, criteria) is `fullstack-calculator`. The reviewer's commands, from the repository root:

    docker build -t fullstack-calculator .
    docker run --rm -p 8080:8080 fullstack-calculator

Then `http://localhost:8080` shows the calculator. Ctrl+C in the `docker run` terminal stops the container through the server's graceful shutdown.

### `.dockerignore`

Exactly these entries:

    .git
    **/node_modules
    frontend/dist
    frontend/coverage
    backend/coverage.out
    backend/coverage.html

### CI workflow

`.github/workflows/ci.yml`, workflow `name: CI`.

| Setting      | Value                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| Triggers     | `push` to `main`, and `pull_request` for any base branch.                                   |
| Permissions  | `contents: read` at workflow level.                                                         |
| Runner       | `ubuntu-latest` for every job.                                                              |
| Dependencies | The three jobs run in parallel. None `needs` another.                                       |
| Actions      | `actions/checkout@v7`, `actions/setup-go@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`. No other action. |

#### Job `backend`

Working directory `backend`. Steps in order:

1. Checkout.
2. `actions/setup-go@v7` with `go-version-file: backend/go.mod` and `cache: false`.
3. `go vet ./...`
4. Format check: `gofmt -l .` must print nothing. Otherwise the step prints the listed files and fails.
5. `go test -coverprofile=coverage.out ./...`, piped through `tee` to save its output to a file for step 8. The step sets `shell: bash`, which GitHub runs as `bash -eo pipefail`, so a failing `go test` fails the step even though `tee` succeeds. The default `run` shell, `bash -e`, has no `pipefail` and would hide the failure.
6. `go tool cover -func=coverage.out` and `go tool cover -html=coverage.out -o coverage.html`.
7. Upload the artifact `backend-coverage` with `backend/coverage.out` and `backend/coverage.html`.
8. Coverage summary and gate, described below.

Steps 6, 7 and 8 run whenever the job was not cancelled (`if: ${{ !cancelled() }}`), so a failing run still has its report.

Gate rules:

| Figure                | Source                                                                                          | Required          |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| `internal/calculator` | The `coverage: N% of statements` that step 5 prints for `github.com/Js-Meneses/fullstack-calculator/backend/internal/calculator`. | exactly `100.0%`  |
| Total                 | The `total:` line of `go tool cover -func=coverage.out`.                                         | at least `85.0%`  |

- The step first appends this table to `$GITHUB_STEP_SUMMARY`, under the heading `Backend coverage`, with the measured value of each figure:

      | Scope | Coverage | Required |
      | --- | --- | --- |
      | `internal/calculator` | 100.0% | 100.0% |
      | Total | 91.2% | ≥ 85.0% |

- Then it fails if either figure misses its requirement, with a message naming the figure.
- It fails closed: a figure that cannot be read counts as missing its requirement.

#### Job `frontend`

Working directory `frontend`. Steps in order:

1. Checkout.
2. `actions/setup-node@v7` with `node-version: 24.16.0`, `cache: npm` and `cache-dependency-path: frontend/package-lock.json`.
3. `npm ci`
4. `npm run lint`
5. `npm run coverage`. The thresholds of 85 in `vite.config.ts` fail the step.
6. Summary: a table under the heading `Frontend coverage`, read from `frontend/coverage/coverage-summary.json`, with one row each for statements, branches, functions and lines, their percentage, and `≥ 85%` as required.
7. Upload the artifact `frontend-coverage` with the folder `frontend/coverage`.
8. `npm run build`

Steps 6 and 7 run whenever the job was not cancelled.

`frontend/vite.config.ts` sets `coverage.reporter` to `['text', 'html', 'json-summary']`. `text` keeps the console table, `html` is the browsable report, and `json-summary` feeds step 6.

#### Job `docker`

Steps in order:

1. Checkout.
2. `docker build -t fullstack-calculator .`
3. `docker run -d --name calculator -p 8080:8080 fullstack-calculator`
4. Wait until `curl -sf http://localhost:8080/` succeeds, trying once per second for at most 30 seconds. Fail if it never does.
5. Smoke checks, in one bash step. Each check compares the status code and the listed header or body. The step stops at the first failure and prints the check, the expected and the actual values.
6. `docker logs calculator`, always (`if: always()`), so a failing run shows the server's log.

| # | Request                                                                                         | Expected                                                                                                     |
| - | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 | `POST /api/v1/calculations`, `Content-Type: application/json`, `{"operation":"add","operands":[2,3]}` | 200, body exactly `{"result":5}`                                                                       |
| 2 | Same with `{"operation":"divide","operands":[1,0]}`                                             | 422, body exactly `{"error":{"code":"division_by_zero","message":"Division by zero is undefined."}}`         |
| 3 | `GET /api/v1/calculations`                                                                      | 405, header `Allow: POST`, body contains `"code":"method_not_allowed"`                                       |
| 4 | `GET /api/v1/nope`                                                                              | 404, `Content-Type: application/json`, body contains `"code":"not_found"`                                    |
| 5 | `GET /`                                                                                         | 200, `Content-Type: text/html; charset=utf-8`, body contains `<title>Calculator</title>`                     |
| 6 | `GET` the first `/assets/*.js` path that the body of check 5 references                         | 200, `Content-Type` starts with `text/javascript`                                                            |
| 7 | `GET /nope`                                                                                     | 404, `Content-Type: text/plain; charset=utf-8`                                                               |
| 8 | `POST /`                                                                                        | 405, header `Allow: GET, HEAD`                                                                               |

### README

`README.md` at the repository root. Markdown that renders on GitHub, with no image other than the CI badge. Sections in this order:

| Heading                              | Content                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `# fullstack-calculator`             | One-paragraph overview (Go API, React client, the API computes every result), then the badge `[![CI](https://github.com/Js-Meneses/fullstack-calculator/actions/workflows/ci.yml/badge.svg)](https://github.com/Js-Meneses/fullstack-calculator/actions/workflows/ci.yml)`. |
| `## Quick start (Docker)`            | Docker as the only prerequisite. The two commands from Docker image, the URL, how to stop it, and `-p 8081:8080` as the way out when port 8080 is taken.                |
| `## Local development`               | Prerequisites: Go 1.27.4, Node 24.16.0 with npm 11.13.0, GNU Make (optional). Backend: `make run` in `backend/`. Frontend: `npm ci` once, then `npm run dev` in `frontend/` and `http://localhost:5173`, with the `/api` proxy explained. Serving the production build without Docker: `npm run build`, then the backend with `STATIC_DIR=../frontend/dist`, in POSIX shell and in PowerShell syntax. A table of the variables `PORT` and `STATIC_DIR`. |
| `## Tests and coverage`              | Backend: `make test`, `make cover`, where `coverage.html` lands. Frontend: `npm run lint`, `npm test`, `npm run coverage`, where `coverage/index.html` lands. The thresholds from `AGENTS.md` and how CI enforces them, linking `.github/workflows/ci.yml`. |
| `## Without make`                    | A table mapping each `backend/Makefile` target (`test`, `cover`, `run`) to the `go` commands it runs. Every flag that contains a dot is quoted: `go test "-coverprofile=coverage.out" ./...`, `go tool cover "-func=coverage.out"`, `go tool cover "-html=coverage.out" -o coverage.html`. Windows PowerShell 5.1 splits such a flag at the dot when it is unquoted. The README says the commands work the same in PowerShell and POSIX shells, and says it of the quoted form only. |
| `## API`                             | The endpoint, request and response shapes, and a link to `backend/api/openapi.yaml`. POSIX-shell curl examples, each followed by the exact response: `add` (200), `sqrt` (200), `divide` by zero (422 `division_by_zero`), a malformed body (400 `invalid_json`), a missing `Content-Type` (415 `unsupported_media_type`), `GET` on the endpoint (405 `method_not_allowed`) and an unknown `/api/` path (404 `not_found`). A PowerShell note: use `curl.exe` for requests without a body, and one `Invoke-RestMethod` example for `add`. |
| `## Design decisions and assumptions` | A short list of the decisions a reviewer is most likely to ask about, each linking to the spec section that records it: one endpoint with the operation in the body; `float64` with NaN and ±Inf as 422; 413 and 415; immediate-execution chaining with no arithmetic in the frontend; 12 significant digits on display with full precision kept; frontend-owned error messages; one image with `STATIC_DIR` and no `index.html` fallback; image tags without digests. Then the assumptions: no authentication, no persistence, one origin so no CORS, English UI with `.` as decimal point. |
| `## Project structure`               | A tree of the repository's top-level files and the folders from the `AGENTS.md` layout, one comment per line.                                                           |
| `## AI-assisted workflow`            | How the project was built: `AGENTS.md` as the guidelines every agent reads; the `/spec` and `/spec-impl` skills in `.claude/skills/`, adapted from [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) and credited in each skill's `NOTICE.md`; one spec per feature in `specs/`, moving from `Draft` to `Approved` (by a human) to `Implemented`; and `PROMPTS.md`, where the skills log every prompt and answer verbatim. Links to each of these files. |

Every response shown in the API section is copied from the running image, not written from the spec.

### Wording changes in existing documents

| File                              | Sentence now                                                              | Becomes                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                       | `Every response is JSON.`                                                 | `Every response on an /api/ path is JSON.` (with `/api/` in backticks)                                    |
| `backend/api/openapi.yaml`        | `Every response is JSON with the header Content-Type: application/json.` | `Every response on an /api/ path is JSON with the header Content-Type: application/json.` (code in backticks) |
| `backend/api/openapi.yaml`        | `Any path other than /api/v1/calculations ... returns 404 with code not_found, whatever the method.` | Says this holds for any other `/api` or `/api/` path. Paths outside `/api/` are not part of the API: without `STATIC_DIR` they get the same JSON 404, and with it they get the frontend's files or a plain-text 404. |
| `specs/01-backend-rest-api.md`    | `Every response has the header Content-Type: application/json.`          | `Every response on an /api/ path has the header Content-Type: application/json.` (code in backticks)     |

SPEC 01 also gains one Decisions line: `**Yes:** the API behaviour in this spec applies to /api and /api/ paths. SPEC 03 adds optional static file serving on every other path through STATIC_DIR. (changed by SPEC 03)`, with the paths and the variable in backticks.

The layout block in `AGENTS.md` gains two lines: `.github/workflows/  # CI (ci.yml)` and `Dockerfile  # one image: API and built frontend`.

## Implementation plan

1. **Static file serving.** Add `STATIC_DIR` handling to `run`, `newHandler` and the filesystem wrapper as described in `STATIC_DIR`, Routing and Code layout. `static_test.go` covers, with a static directory: `GET /` returns `index.html` with `Content-Type: text/html; charset=utf-8`; `HEAD /` returns 200; `GET /assets/app.js` returns the file's body, with no assertion on its `Content-Type` (see Routing); `GET /index.html` returns 301 to `./`; `GET /nope`, `GET /assets/empty/` and `GET /assets/empty` return the plain-text 404; `POST /` and `POST /nope` return the plain-text 405 with `Allow: GET, HEAD`; a request for `/../<name>` of a file placed next to the static directory does not return that file; `POST /api/v1/calculations` returns `{"result":5}`; `GET /api/v1/calculations` returns the JSON 405; `GET /api` and `GET /api/nope` return the JSON 404. It also covers, with an empty `staticDir`, that `GET /` returns the JSON 404. `main_test.go` covers `run` returning `errInvalidStaticDir` for a missing path and for a regular file, and a `run` with `STATIC_DIR` set that answers `GET /` with the page. Reword the sentences listed in Wording changes and add the SPEC 01 Decisions line.
   - Files: `backend/cmd/server/main.go`, `backend/cmd/server/static.go`, `backend/cmd/server/static_test.go`, `backend/cmd/server/main_test.go`, `backend/api/openapi.yaml`, `AGENTS.md`, `specs/01-backend-rest-api.md`
   - Verify: in `backend/`, `go vet ./...` and `gofmt -l .` print nothing, `go test -cover ./internal/calculator/` reports 100.0%, and `make cover` reports a `total:` of at least 85.0%. From the repository root, `npx @redocly/cli@2.84.0 lint backend/api/openapi.yaml` exits with status 0. Then `npm run build` in `frontend/`, and in `backend/` run `$env:STATIC_DIR = '../frontend/dist'; make run` in PowerShell. `http://localhost:8080` shows the calculator, and clicking `2 + 3 × 4 =` shows `20`. Stop it and run `Remove-Item Env:STATIC_DIR`.
   - Commit: `feat(server): serve the built frontend from STATIC_DIR`
2. **Docker image.** Add the `Dockerfile` and `.dockerignore` from Docker image and `.dockerignore`. Add the `Dockerfile` line to the `AGENTS.md` layout.
   - Files: `Dockerfile`, `.dockerignore`, `AGENTS.md`
   - Verify: with `frontend/node_modules` and `frontend/dist` present locally, `docker build -t fullstack-calculator .` succeeds. `docker run --rm -p 8080:8080 fullstack-calculator` logs the start line with `static_dir=/app/static`. In a second window, `Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/calculations -ContentType application/json -Body '{"operation":"add","operands":[2,3]}'` prints `result` `5`, `curl.exe -i http://localhost:8080/nope` shows 404 with `Content-Type: text/plain; charset=utf-8`, and the browser at `http://localhost:8080` shows `20` for `2 + 3 × 4 =`. Ctrl+C in the first window stops the container.
   - Commit: `chore(docker): add multi-stage image for API and frontend`
3. **CI workflow.** Add `.github/workflows/ci.yml` as in CI workflow. Set the coverage reporters in `frontend/vite.config.ts`. Add the `.github/workflows/` line to the `AGENTS.md` layout.
   - Files: `.github/workflows/ci.yml`, `frontend/vite.config.ts`, `AGENTS.md`
   - Verify: in `frontend/`, `npm run coverage` passes and writes `coverage/coverage-summary.json`. In Git Bash, the commands of the `backend` job's steps 3 to 6 and 8, run in `backend/` with `GITHUB_STEP_SUMMARY` pointing to a scratch file, pass and write the `Backend coverage` table to it. The run on GitHub is checked by the user after pushing (see the `(manual)` criteria), because `/spec-impl` never pushes.
   - Commit: `chore(ci): add GitHub Actions workflow with coverage gate`
4. **README.** Write `README.md` as in README. Run every curl example against the image from step 2 and paste the actual responses.
   - Files: `README.md`
   - Verify: every relative link target in `README.md` exists in the working tree (`git ls-files` lists it). In Git Bash, each curl example, run against `docker run --rm -p 8080:8080 fullstack-calculator`, prints the response shown under it. Rendering on GitHub is checked by the user after pushing.
   - Commit: `docs: add project README`

## Acceptance criteria

- [ ] In `backend/`, `go vet ./...` and `gofmt -l .` print nothing, `go test -cover ./internal/calculator/` reports `coverage: 100.0% of statements`, and `make cover` reports a `total:` of at least 85.0%.
- [ ] `go test -v ./cmd/server/` shows passing cases for every row of the routing table, the `..` case, the 301 for `/index.html`, the empty-`staticDir` JSON 404, and `errInvalidStaticDir` for a missing path and for a regular file.
- [ ] With `STATIC_DIR` unset, `make run` in `backend/` and `curl.exe -i http://localhost:8080/` show 404 with `Content-Type: application/json` and the code `not_found`.
- [ ] From the repository root, `npx @redocly/cli@2.84.0 lint backend/api/openapi.yaml` exits with status 0.
- [ ] `git grep -n "Every response" -- AGENTS.md backend/api/openapi.yaml specs/01-backend-rest-api.md` lists exactly three lines, one per file, and each starts its sentence with `Every response on an /api/ path`.
- [ ] The `FROM` lines of `Dockerfile` name exactly `node:24.16.0-alpine`, `golang:1.27.4-alpine` and `gcr.io/distroless/static-debian13:nonroot`, and the file has no `HEALTHCHECK`.
- [ ] `.dockerignore` holds exactly the six entries listed in `.dockerignore`.
- [ ] From the repository root, `docker build -t fullstack-calculator .` succeeds.
- [ ] `docker image inspect fullstack-calculator --format '{{.Config.User}}'` prints `nonroot:nonroot`, and `docker image inspect fullstack-calculator --format '{{.Size}}'` prints a number below 25000000.
- [ ] With `docker run --rm -p 8080:8080 fullstack-calculator` running, each request in the smoke-check table returns its expected result.
- [ ] (manual) With the container running, `http://localhost:8080` shows the calculator, and clicking `2 + 3 × 4 =` shows `20`. Ctrl+C in the `docker run` window logs the shutdown line and the container exits.
- [ ] `.github/workflows/ci.yml` triggers on `push` to `main` and on `pull_request`, sets `contents: read`, and its `uses:` lines name only `actions/checkout@v7`, `actions/setup-go@v7`, `actions/setup-node@v7` and `actions/upload-artifact@v7`.
- [ ] (manual) After the user pushes the branch and opens its pull request, the `CI` run shows the jobs `backend`, `frontend` and `docker` passing.
- [ ] (manual) That run's `backend` summary shows the `Backend coverage` table with `internal/calculator` at 100.0% and the total at 85.0% or more, and its `frontend` summary shows the `Frontend coverage` table with four rows at 85% or more.
- [ ] (manual) That run lists the artifacts `backend-coverage` and `frontend-coverage`.
- [ ] `README.md` has the headings of the README table in that order, and its only image is the CI badge.
- [ ] The `Without make` table in `README.md` shows `"-coverprofile=coverage.out"`, `"-func=coverage.out"` and `"-html=coverage.out"` in double quotes.
- [ ] Every relative link target in `README.md` is listed by `git ls-files`.
- [ ] (manual) After the push, `README.md` renders on GitHub and the badge shows the status of `CI`.
- [ ] Each curl example in `README.md`, run against the container, prints the response shown under it.
- [ ] The branch adds no binary file: `git diff --name-only main` lists only files named in the implementation plan, plus the spec and `PROMPTS.md`.

## Decisions

- **Yes:** base images pinned by exact tag, and actions by major tag (`@v7`, the latest major of all four on 2026-11-26). Easy to read and to update by hand. (asked)
- **No:** image digests and action commit SHAs. Byte-reproducible, but every update needs a lookup, and the project has no bot to do it.
- **Yes:** with `STATIC_DIR` set, any method other than `GET` or `HEAD` on a non-API path is a plain-text 405, checked before the file lookup. (asked)
- **No:** 405 only for existing files, or `http.FileServer`'s default of serving a file for any method.
- **Yes:** a `STATIC_DIR` that is not an existing directory stops the server at startup with exit status 1, like an invalid `PORT`. A misconfigured image fails loudly. (asked)
- **Yes:** README curl examples in POSIX shell, plus a PowerShell note with `curl.exe` and one `Invoke-RestMethod` example. (asked)
- **Yes:** one spec for the image, CI and README. The `docker` job tests the image and the README documents both; each plan step still ships on its own. (default, not asked)
- **Yes:** an API path is `/api` or anything under `/api/`, matched case-sensitively on the raw path without `http.ServeMux`, for the same reason SPEC 01 avoids it: plain-text redirects and 405s. (default, not asked)
- **Yes:** an empty `STATIC_DIR` means unset, as an empty `PORT` does. (default, not asked)
- **Yes:** no directory listings and no `Cache-Control` header. A listing exposes the build layout; caching rules are an optimisation nobody asked for. (default, not asked)
- **Yes:** the static routing lives in `cmd/server/static.go`, not a new package. It is wiring of two handlers and a filesystem, about 40 lines, with no domain or JSON logic; `internal/httpapi` stays the JSON API. (default, not asked)
- **Yes:** `CGO_ENABLED=0`, `-trimpath` and `-ldflags="-s -w"` for a static, smaller binary that runs on `distroless/static`. (default, not asked)
- **Yes:** `USER nonroot:nonroot` written in the final stage although the base already sets it, so the image's user is visible in the `Dockerfile`. (default, not asked)
- **Yes:** the image sets `STATIC_DIR` but not `PORT`, and runs no tests. CI runs the tests; the image only builds. (default, not asked)
- **Yes:** the three CI jobs run in parallel. Each reports its own failure; a backend test failure does not hide a broken image. (default, not asked)
- **Yes:** plain `docker build` in CI, the same command as the README, without buildx caching actions. (default, not asked)
- **Yes:** the smoke checks live inline in `ci.yml`, not in a script. Nothing else runs them. (default, not asked)
- **Yes:** `setup-go` with `cache: false`. The module has no dependencies and no `go.sum`, which the cache keys on. (default, not asked)
- **Yes:** the coverage gate fails closed, and the summary shows both measured figures on every run. (default, not asked)
- **Yes:** the frontend coverage reporters become `text`, `html` and `json-summary` in `vite.config.ts`, so local runs and CI produce the same reports. The unused `clover` and `json` defaults are dropped. (default, not asked)
- **Yes:** `chore(docker)` and `chore(ci)` commit subjects. `AGENTS.md` lists `feat`, `fix`, `test`, `docs` and `chore`, and packaging and CI change no runtime behaviour. (default, not asked)

## Risks

| Risk                                                                                                         | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A native frontend tool (TypeScript 7, Vite's bundler, oxlint) has no musl build, or the lockfile made on Windows lacks the Linux musl package, so `npm ci` or `npm run build` fails on `node:24.16.0-alpine`. | Step 2's verify catches it. Changing the base image would change this spec, so the implementer stops and asks.                                   |
| The `:nonroot` distroless tag moves, so two builds of the same commit can differ.                            | Accepted with tag-only pinning. The `docker` job builds and smoke-tests every change.                                                           |
| The Go version is written in `backend/go.mod` and in the `Dockerfile`, and they can drift.                   | The official Go images set `GOTOOLCHAIN=local`, so a `go.mod` newer than the image fails the build in the `docker` job.                         |
| The coverage gate's failure path never runs on a passing branch.                                             | The gate fails closed and prints both figures in the summary of every run, so a parsing error shows up as a failed job, not a silent pass.      |
| Port 8080 is taken on the reviewer's machine.                                                                | The README shows `-p 8081:8080`.                                                                                                                 |
