# SPEC 02 — Frontend calculator

> **Status:** Approved
> **Depends on:** SPEC 01
> **Date:** 2026-11-26
> **Objective:** A React + TypeScript pocket calculator in `frontend/` that gets every result from `POST /api/v1/calculations` and works with mouse, touch and keyboard.

## Scope

**In:**

- Vite app in `frontend/`, scaffolded with create-vite 9.4.0 and the `react-ts` template. React, TypeScript and CSS Modules only: no UI, state or HTTP library.
- A display with an expression line and a main line, and a keypad of 22 keys: digits, decimal point, sign toggle, the seven backend operations, equals, clear and backspace.
- Immediate-execution chaining with one API call per step. The frontend never computes a result.
- Entry rules, result formatting, error messages, pending-request behaviour and keyboard shortcuts as described in Data model.
- A pure reducer in `src/calculator/reducer.ts` behind the hook `useCalculator`.
- One typed client module, `src/api/client.ts`, that never rejects. API types are written by hand in `src/api/types.ts`.
- Responsive layout from 320px wide. Semantic buttons, visible focus, a live display region.
- Vitest with jsdom, React Testing Library and user-event. Unit tests for the formatter, the reducer and the client, hook tests, and component tests for the main flows. Coverage thresholds of 85%.
- Vite dev proxy from `/api` to `http://localhost:8080`.
- The linter the template ships: oxlint, with the template's `.oxlintrc.json`.
- The frontend part of the repository layout in `AGENTS.md`.

**Out of scope:**

- Docker, CI, and serving the built frontend from Go.
- Calculation history and memory keys.
- The project README.
- CORS. The dev proxy makes every request same-origin.
- Themes and dark mode. The page has one colour scheme.
- Digit grouping and locale-aware number formatting.
- Parsing typed or pasted expressions such as `2+3*4`.
- End-to-end browser tests.

## Data model

### API types

`src/api/types.ts`, written by hand from `backend/api/openapi.yaml`:

```ts
export type BinaryOperation =
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage'

export type CalculationRequest =
  | { operation: 'sqrt'; operands: [number] }
  | { operation: BinaryOperation; operands: [number, number] }

export type ApiErrorCode =
  | 'invalid_json' | 'invalid_request' | 'unknown_operation'
  | 'invalid_operand_count' | 'not_found' | 'method_not_allowed'
  | 'body_too_large' | 'unsupported_media_type' | 'division_by_zero'
  | 'negative_square_root' | 'result_out_of_range' | 'undefined_result'
  | 'internal_error'

export type CalculationOutcome =
  | { kind: 'success'; result: number }
  | { kind: 'api-error'; code: ApiErrorCode }
  | { kind: 'network-error' }
  | { kind: 'aborted' }
```

### API client

`src/api/client.ts` exports `calculate(request: CalculationRequest, signal?: AbortSignal): Promise<CalculationOutcome>`. It is the only module that calls `fetch`.

It sends `POST /api/v1/calculations` with the header `Content-Type: application/json` and `JSON.stringify(request)` as the body. The URL is relative, so the dev proxy forwards it.

The promise never rejects. The first matching row decides the outcome:

| Order | Situation                                                                                    | Outcome                       |
| ----- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | The caller's `signal` is aborted at any point before `calculate` resolves.                   | `aborted`                     |
| 2     | No response within 10 s. The client aborts the request itself.                               | `network-error`               |
| 3     | `fetch` rejects, or reading the body fails.                                                  | `network-error`               |
| 4     | Status 200 and the body is a JSON object whose `result` is a finite number.                  | `success` with that `result`  |
| 5     | Status other than 200 and the body is `{"error":{"code": ...}}` with a code from `ApiErrorCode`. | `api-error` with that `code` |
| 6     | Anything else: a body that is not JSON, JSON of another shape, or an unknown code.           | `network-error`               |

Row 6 covers the Vite proxy's plain-text 500 when the backend is not running. The server's `message` is not used: the frontend has its own messages.

### Error messages

`src/calculator/messages.ts` maps every `ErrorReason` (an `ApiErrorCode` or `'network'`) to one message. The map is typed as a `Record`, so a missing code fails the build.

| Reason                   | Message                                |
| ------------------------ | -------------------------------------- |
| `division_by_zero`       | `Cannot divide by zero`                |
| `negative_square_root`   | `No square root of a negative number`  |
| `result_out_of_range`    | `Result is too large`                  |
| `undefined_result`       | `Result is undefined`                  |
| `invalid_json`           | `Request could not be read`            |
| `invalid_request`        | `Request was not valid`                |
| `unknown_operation`      | `Operation not supported`              |
| `invalid_operand_count`  | `Wrong number of operands`             |
| `not_found`              | `Service not found`                    |
| `method_not_allowed`     | `Request method not allowed`           |
| `body_too_large`         | `Request is too large`                 |
| `unsupported_media_type` | `Request format not supported`         |
| `internal_error`         | `Server error, try again`              |
| `network`                | `Cannot reach the server, try again`   |

`network` is the message for every `network-error` outcome.

### Number formatting

`src/calculator/format.ts` exports `formatNumber(value: number): string`. It is used for results and for the expression line, never for the number being typed.

1. Take `value.toPrecision(12)`. This rounds to 12 significant digits and switches to exponent form when the exponent is below -6 or at least 12.
2. In the digits before any `e`, drop trailing zeros after the decimal point, then a trailing decimal point.
3. `-0` formats as `0`.

| `value`                 | Display              |
| ----------------------- | -------------------- |
| `20`                    | `20`                 |
| `0.30000000000000004`   | `0.3`                |
| `1234567.5`             | `1234567.5`          |
| `123456789012`          | `123456789012`       |
| `1234567890123`         | `1.23456789012e+12`  |
| `999999999999.5`        | `1e+12`              |
| `1e15`                  | `1e+15`              |
| `0.000001`              | `0.000001`           |
| `0.00000012`            | `1.2e-7`             |
| `-9.332636185032189e-302` | `-9.33263618503e-302` |
| `-0`                    | `0`                  |

The longest possible result is 19 characters, for example `-9.33263618503e-302`. The longest possible entry is 14 characters (see Entry rules).

### Calculator state

`src/calculator/reducer.ts`:

```ts
type Input = { kind: 'entry'; text: string } | { kind: 'value'; value: number }
type FollowUp =
  | { kind: 'chain'; operator: BinaryOperation } | { kind: 'equals' } | { kind: 'sqrt' }
type ErrorReason = ApiErrorCode | 'network'

type State = {
  accumulator: number | null        // left operand; set exactly when operator is set
  operator: BinaryOperation | null  // pending binary operator
  input: Input | null               // null only right after an operator key
  pending: { id: number; request: CalculationRequest; followUp: FollowUp } | null
  error: ErrorReason | null
  nextId: number
}

type UserAction =
  | { type: 'digit'; digit: string }   // '0' to '9'
  | { type: 'decimal' } | { type: 'toggleSign' } | { type: 'backspace' }
  | { type: 'operator'; operator: BinaryOperation } | { type: 'sqrt' }
  | { type: 'equals' } | { type: 'clear' }
type Action = UserAction | { type: 'response'; id: number; outcome: CalculationOutcome }
```

The initial state is: no accumulator, no operator, input `{ kind: 'entry', text: '0' }`, nothing pending, no error, `nextId` 0.

Every return to the initial state described below (`clear`, a key that recovers from an error, and an `api-error` or `network-error` response) keeps the current `nextId`, so a request id is never reused.

An `entry` holds exactly what the user typed. A `value` holds the full `float64` from the API, never rounded.

The **displayed number** is the entry parsed with `Number(text)`, or the value, or the accumulator when `input` is `null`.

A **request** sets `pending` to `{ id: nextId, request, followUp }` and increments `nextId`. Nothing else changes until the response.

### Entry rules

- Every digit character counts towards the limit of 12, including the `0` in `0.5`. The sign and the point do not count.
- A digit is ignored when the entry already has 12 digits.
- A digit replaces an entry of `0`, and turns `-0` into `-` followed by the digit. This is the only leading-zero rule: `0.0` is allowed.
- The decimal point is ignored when the entry already has one, or already has 12 digits.
- Backspace removes the last character. An entry that becomes empty or `-` becomes `0`.
- The longest entries are 14 characters, such as `-0.12345678901` and `-1234567890.12`.
- An entry of 12 digits has at most 12 significant digits, so `formatNumber` shows it in the expression line as typed, minus trailing zeros after the point and a trailing point. A value with six or more leading zeros after the point switches to exponent form: `0.0000001` becomes `1e-7`.

### Transitions

While `pending` is set, every action except `clear` and `response` is ignored. While `error` is set, the error columns apply. The "Normal" column applies otherwise.

| Action          | Normal                                                                                                                                                                      | While `error` is set                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `digit`         | `input` `null` or `value`: new entry with the digit. `entry`: Entry rules.                                                                                                  | Back to initial state, then the digit.       |
| `decimal`       | `input` `null` or `value`: new entry `0.`. `entry`: Entry rules.                                                                                                            | Back to initial state, then the point: `0.`. |
| `toggleSign`    | `entry`: add or remove the leading `-` (so `0` becomes `-0`). `value`: the value negated. `input` `null`: input becomes the accumulator negated. A zero value stays `0`.     | Ignored.                                     |
| `backspace`     | `entry`: Entry rules. `value` or `null`: ignored.                                                                                                                           | Back to initial state.                       |
| `operator` op   | No operator: accumulator = displayed number, operator = op, input `null`. Operator set and input `null`: operator = op. Otherwise: request `[accumulator, displayed number]` with the pending operator, follow-up `chain` op. | Ignored.                    |
| `sqrt`          | Request `sqrt` of the displayed number, follow-up `sqrt`.                                                                                                                   | Ignored.                                     |
| `equals`        | No operator, or input `null`: ignored. Otherwise: request `[accumulator, displayed number]` with the pending operator, follow-up `equals`.                                   | Ignored.                                     |
| `clear`         | Initial state.                                                                                                                                                              | Initial state.                               |

`clear` while pending also returns the initial state, which drops `pending`.

A `response` is ignored unless `pending` is set and its `id` matches. When it matches:

| Outcome                         | New state                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `success`, follow-up `chain` op | accumulator = result, operator = op, input `null`.                                                |
| `success`, follow-up `equals`   | accumulator and operator cleared, input = `value` result.                                         |
| `success`, follow-up `sqrt`     | input = `value` result. Accumulator and operator unchanged.                                       |
| `api-error` code                | Initial state with `error` = code.                                                                |
| `network-error`                 | Initial state with `error` = `'network'`.                                                         |
| `aborted`                       | `pending` cleared, nothing else changes.                                                          |

Worked examples, each step sending one request:

| Keys                | Requests                                        | Final main line |
| ------------------- | ----------------------------------------------- | --------------- |
| `2 + 3 × 4 =`       | `add [2,3]`, `multiply [5,4]`                   | `20`            |
| `10 % 200 =`        | `percentage [10,200]`                           | `20`            |
| `2 + 9 √ =`         | `sqrt [9]`, `add [2,3]`                         | `5`             |
| `2 + √ =`           | `sqrt [2]`, `add [2,1.4142135623730951]`        | `3.41421356237` |
| `2 + × 3 =`         | `multiply [2,3]`                                | `6`             |
| `2 + =`             | none                                            | `2`             |
| `2 + 3 = =`         | `add [2,3]`                                     | `5`             |
| `1 ÷ 0 =`           | `divide [1,0]`                                  | `Cannot divide by zero` |

### View

`reducer.ts` also exports `selectView(state)`, which the components render:

| Field             | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `main`            | The error message when `error` is set; else the entry text, or `formatNumber` of the value, or of the accumulator when input is `null`. |
| `expression`      | `formatNumber(accumulator)`, a space and the operator symbol, when an operator is set. Otherwise empty. |
| `isError`         | `error` is set.                                                                                         |
| `busy`            | `pending` is set.                                                                                       |
| `pressedOperator` | The pending operator, or `null`.                                                                        |

Operator symbols in the expression line: `add` `+`, `subtract` `−`, `multiply` `×`, `divide` `÷`, `power` `^`, `percentage` `%`.

### Hook

`src/calculator/useCalculator.ts` exports `useCalculator(): { view, press }`, where `press(action: UserAction)` dispatches to the reducer.

When `pending` becomes set, an effect creates an `AbortController` and calls `calculate(pending.request, controller.signal)`. When the outcome arrives, it dispatches `response` with the pending `id`, unless its own controller was aborted. The effect's cleanup aborts the controller, so `clear` and unmount cancel the request.

### Keypad

Four columns, six rows, 22 keys. `=` spans two rows and `0` spans two columns.

| Row | Keys                       |
| --- | -------------------------- |
| 1   | `C` `⌫` `%` `÷`            |
| 2   | `√` `xʸ` `±` `×`           |
| 3   | `7` `8` `9` `−`            |
| 4   | `4` `5` `6` `+`            |
| 5   | `1` `2` `3` `=`            |
| 6   | `0` (two columns) `.`      |

Every key is a `<button type="button">`. Accessible names:

| Label         | Accessible name  | Action                     |
| ------------- | ---------------- | -------------------------- |
| `0`–`9`       | The digit        | `digit`                    |
| `.`           | `Decimal point`  | `decimal`                  |
| `±`           | `Toggle sign`    | `toggleSign`               |
| `+`           | `Add`            | `operator` `add`           |
| `−`           | `Subtract`       | `operator` `subtract`      |
| `×`           | `Multiply`       | `operator` `multiply`      |
| `÷`           | `Divide`         | `operator` `divide`        |
| `xʸ`          | `Power`          | `operator` `power`         |
| `%`           | `Percentage`     | `operator` `percentage`    |
| `√`           | `Square root`    | `sqrt`                     |
| `=`           | `Equals`         | `equals`                   |
| `C`           | `Clear`          | `clear`                    |
| `⌫`           | `Backspace`      | `backspace`                |

The six binary operator keys carry `aria-pressed`: `true` on the key of `pressedOperator`, `false` on the others.

While `busy`, every key except `Clear` has `aria-disabled="true"` and is visually dimmed. The keys keep focus and receive clicks, which the reducer ignores. The calculator root has `aria-busy="true"`.

### Display

- The main line is an `<output>` with `aria-live="polite"`, so its implicit role is `status`. It is right-aligned and never wraps a number.
- Up to 12 characters, the main line uses its large size. Above 12, a smaller size that fits 19 characters on one line at a viewport of 320px.
- An error message uses the smaller size and may wrap to two lines.
- The expression line sits above the main line, in a small size. It keeps its height when empty, so the layout does not move.

### Keyboard

One `keydown` listener on `window`, registered by the `Calculator` component. `src/calculator/keyboard.ts` exports `keyToAction(key: string): UserAction | null`, which maps `event.key`:

| `event.key`               | Action                   |
| ------------------------- | ------------------------ |
| `0`–`9`                   | `digit`                  |
| `.` `,`                   | `decimal`                |
| `+`                       | `operator` `add`         |
| `-`                       | `operator` `subtract`    |
| `*`                       | `operator` `multiply`    |
| `/`                       | `operator` `divide`      |
| `p` `P` `^`               | `operator` `power`       |
| `%`                       | `operator` `percentage`  |
| `r` `R`                   | `sqrt`                   |
| `n` `N`                   | `toggleSign`             |
| `Enter` `=`               | `equals`                 |
| `Escape`                  | `clear`                  |
| `Backspace` `Delete`      | `backspace`              |

Listener rules:

- An event with Ctrl, Meta or Alt held is ignored, so browser shortcuts such as Ctrl+R keep working. The exception is AltGr (`event.getModifierState('AltGraph')`), which European layouts need for some characters.
- For a mapped key, the listener calls `preventDefault()` and then `press`. `Enter` therefore means equals even when a key has focus, and does not also click that key.
- Space is not mapped. It activates the focused key through the browser's native button behaviour.
- Auto-repeat events from a held key are handled like any other keydown.
- `^` is a dead key on some layouts (`event.key` is `Dead`), so `p` is the reliable power shortcut.

### Layout and accessibility

- The page is a `<main>` with a visually hidden `<h1>Calculator</h1>`.
- The calculator is centred, takes the full width up to 400px, and causes no horizontal scroll at 320px.
- Keys are at least 44px high, use `touch-action: manipulation`, and show a visible `:focus-visible` outline of at least 3px.
- Text has a contrast ratio of at least 4.5:1 against its background.

### Tooling

| Item           | Value                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold       | From the repository root: `npx -y create-vite@9.4.0 frontend --template react-ts --no-interactive`                                      |
| Node           | 24.16.0 (installed). npm 11.13.0.                                                                                                      |
| Template stack | React 19.3, TypeScript 7.0, Vite 8.4, oxlint 1.94, as the template ships them.                                                         |
| Test packages  | `vitest@5.1.2`, `@vitest/coverage-v8@5.1.2`, `jsdom@31.0.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.13`, `@testing-library/jest-dom@8.0.0`, all as dev dependencies. |
| Scripts        | The template's `dev`, `build`, `lint` and `preview`, plus `test` = `vitest run` and `coverage` = `vitest run --coverage`.              |
| Vite config    | `vite.config.ts` uses `defineConfig` from `vitest/config`. `server.proxy` maps `/api` to `http://localhost:8080`.                       |
| Test config    | `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `unstubGlobals: true`. The setup file imports `@testing-library/jest-dom/vitest` and runs `cleanup` after each test. |
| Coverage       | Provider `v8`. Include `src/**/*.{ts,tsx}`. Exclude `src/main.tsx`, `src/test/**` and `**/*.test.{ts,tsx}`. Thresholds: 85 for `statements`, `branches`, `functions` and `lines`. |
| Fetch in tests | `vi.stubGlobal('fetch', vi.fn(...))`. No test reaches the network.                                                                      |

Generated folders are already ignored: the root `.gitignore` lists `frontend/node_modules`, `frontend/dist` and `frontend/coverage`. `frontend/package-lock.json` is committed.

## Implementation plan

1. **Scaffold, tooling and API client.** Run the scaffold command from Tooling. Delete the template demo files: `src/App.tsx`, `src/App.css`, `src/assets/`, `public/icons.svg` and `README.md`. `src/main.tsx` renders `<main><h1>Calculator</h1></main>` until step 5. Replace `src/index.css` with a small global reset. Set the `index.html` title to `Calculator`. Install the test packages and configure Vite, Vitest and coverage as in Tooling. Add `src/api/types.ts` and `src/api/client.ts`. `client.test.ts` covers the request method, URL, header and body, and every row of the client table: a pre-aborted and a mid-flight aborted signal, the 10 s timeout with fake timers, a rejected `fetch`, success, an `api-error` for a known code, and `network-error` for a plain-text body, a body of the wrong shape, a non-finite `result` and an unknown code.
   - Files: `frontend/` as generated (`package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `.gitignore`, `public/favicon.svg`, `src/main.tsx`, `src/index.css`), `frontend/src/test/setup.ts`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`
   - Verify: in `frontend/`, `npm run lint`, `npm run build` and `npm run coverage` all pass.
   - Commit: `feat(frontend): scaffold Vite app with typed API client`
2. **Formatting and messages.** Add `formatNumber` and the message map. `format.test.ts` covers every row of the formatting table. `messages.test.ts` asserts that every reason has a non-empty message and that no two reasons share one.
   - Files: `frontend/src/calculator/format.ts`, `frontend/src/calculator/format.test.ts`, `frontend/src/calculator/messages.ts`, `frontend/src/calculator/messages.test.ts`
   - Verify: in `frontend/`, `npm run coverage` passes.
   - Commit: `feat(frontend): add result formatting and error messages`
3. **Calculator reducer.** Add the state, actions, `reducer`, `initialState` and `selectView`. `reducer.test.ts` covers every cell of the transitions table, every entry rule, every response row, a response with a stale `id`, every action ignored while pending, `clear` while pending, and the worked examples by feeding `response` actions.
   - Files: `frontend/src/calculator/reducer.ts`, `frontend/src/calculator/reducer.test.ts`
   - Verify: in `frontend/`, `npm run coverage` passes.
   - Commit: `feat(frontend): add calculator reducer`
4. **Hook.** Add `useCalculator`. `useCalculator.test.ts` uses `renderHook` with a stubbed `fetch` and asserts one request per step, the result in `view.main`, `busy` while pending, the abort of the request on `clear`, and that a response arriving after `clear` changes nothing.
   - Files: `frontend/src/calculator/useCalculator.ts`, `frontend/src/calculator/useCalculator.test.ts`
   - Verify: in `frontend/`, `npm run coverage` passes.
   - Commit: `feat(frontend): add useCalculator hook`
5. **Display and keypad.** Add `Calculator`, `Display` and `Keypad` with their CSS Modules, as in Keypad, Display and Layout and accessibility. `src/main.tsx` renders `<Calculator />`. `Calculator.test.tsx` drives the UI with user-event clicks and a stubbed `fetch`, and covers the worked examples, rounding with full precision kept, the 12-digit limit, an API error and recovery with a digit, the network message, pending behaviour, and `aria-pressed`. Update the `frontend/` part of the layout in `AGENTS.md` to list `src/api/`, `src/calculator/` and `src/components/`.
   - Files: `frontend/src/main.tsx`, `frontend/src/components/Calculator.tsx`, `frontend/src/components/Calculator.module.css`, `frontend/src/components/Calculator.test.tsx`, `frontend/src/components/Display.tsx`, `frontend/src/components/Display.module.css`, `frontend/src/components/Keypad.tsx`, `frontend/src/components/Keypad.module.css`, `AGENTS.md`
   - Verify: in `frontend/`, `npm run lint`, `npm run build` and `npm run coverage` pass. Then run `make run` in `backend/` and `npm run dev` in `frontend/`, open `http://localhost:5173`, and click `2 + 3 × 4 =`: the display shows `20`.
   - Commit: `feat(frontend): add calculator display and keypad`
6. **Keyboard input.** Add `keyToAction` and the `window` listener with the listener rules. `keyboard.test.ts` covers every row of the keyboard table and an unmapped key. `Calculator.test.tsx` gains keyboard tests: typing `12+3=` with `user.keyboard`, `Enter` with the `7` key focused, Space with the `7` key focused, `Escape` while pending, and `Control+r` ignored.
   - Files: `frontend/src/calculator/keyboard.ts`, `frontend/src/calculator/keyboard.test.ts`, `frontend/src/components/Calculator.tsx`, `frontend/src/components/Calculator.test.tsx`
   - Verify: in `frontend/`, `npm run coverage` passes. With both servers running, typing `10%200` and Enter shows `20`.
   - Commit: `feat(frontend): add keyboard shortcuts`

## Acceptance criteria

- [ ] `frontend/package.json` has only `react` and `react-dom` in `dependencies`, and the test packages from Tooling at their listed versions in `devDependencies`.
- [ ] In `frontend/`, `npm run lint` exits with status 0 and prints no warning or error.
- [ ] In `frontend/`, `npm run build` exits with status 0.
- [ ] In `frontend/`, `npm run coverage` passes with thresholds of 85 for statements, branches, functions and lines set in `vite.config.ts`.
- [ ] `git grep -n "fetch(" -- frontend/src ":!*.test.*"` lists only `frontend/src/api/client.ts`.
- [ ] A client test asserts that a `fetch` that never answers resolves to `network-error` after 10 s of fake time, and that aborting the caller's signal resolves to `aborted`.
- [ ] A client test asserts that a status 500 with the plain-text body `Internal Server Error` resolves to `network-error`.
- [ ] A component test clicks `2 + 3 × 4 =` and asserts exactly two requests, `add [2,3]` then `multiply [5,4]`, and the display `20`.
- [ ] A component test clicks `10 % 200 =` and asserts one request, `percentage [10,200]`, and the display `20`.
- [ ] A component test clicks `9 √` and asserts the request `sqrt [9]` is sent before any operator or equals.
- [ ] A component test answers `0.1 + 0.2 =` with `0.30000000000000004`, asserts the display `0.3`, then clicks `× 1 0 =` and asserts the request `multiply [0.30000000000000004,10]`.
- [ ] A component test clicks thirteen digits and asserts that the display shows the first twelve.
- [ ] A component test clicks `1 ÷ 0 =`, answers 422 `division_by_zero`, asserts `Cannot divide by zero`, then clicks `7` and asserts the display `7`.
- [ ] A component test makes `fetch` reject and asserts `Cannot reach the server, try again`.
- [ ] A component test holds a response, asserts that clicking `5` changes nothing, clicks `C`, asserts that the request's signal is aborted and the display shows `0`.
- [ ] A component test clicks `2 + 3`, focuses the `7` key and presses `Enter`: the request `add [2,3]` is sent, the display shows `5`, and no `7` is entered. A second test focuses the `7` key from the initial state and presses Space: the display shows `7`.
- [ ] A component test presses `Control+r` and asserts that no request is sent.
- [ ] (manual) With `make run` in `backend/` and `npm run dev` in `frontend/`, clicking `2 + 3 × 4 =` shows `20`, and the browser's network panel shows two `POST /api/v1/calculations` requests.
- [ ] (manual) With the backend stopped, clicking `1 + 1 =` shows `Cannot reach the server, try again`.
- [ ] (manual) At a viewport of 320px wide, there is no horizontal scroll and all 22 keys are visible. Clicking `2 xʸ 1 0 0 0 ± = ±` shows `-9.33263618503e-302` on one line.
- [ ] (manual) Tab moves focus through every key with a visible outline.

## Decisions

- **Yes:** `2 + =` and a repeated `=` are no-ops. Every API call maps to a visible step, and the state needs no "last operation". (asked)
- **No:** classic repeat-equals and `2 + =` as `2 + 2`. It hides an operand the user never typed.
- **Yes:** `±` on an API value flips its sign locally, and a zero stays `0`. Negation is exact, so the "no arithmetic" rule holds. (asked)
- **No:** `multiply [x, -1]` for `±`. A request and a locked keypad for a sign change.
- **Yes:** after an error, a digit or the point starts a new number; `C`, Escape and Backspace clear the message; other keys are ignored. (asked)
- **Yes:** `C` and Escape stay active while a request is pending and abort it. A request with no answer after 10 s shows the network message. (asked)
- **Yes:** extra keys `%` for percentage, `,` and `.` for the decimal point, `=` for equals, Delete for backspace. The numpad decimal key sends `,` on Spanish and other European layouts. (asked)
- **Yes:** plain results with `.` as decimal point, no grouping, and exponent form from `toPrecision(12)`. (asked)
- **Yes:** an expression line such as `12 ×` and `aria-pressed` on the pending operator key. Without them, pressing an operator changes nothing visible. (asked)
- **Yes:** oxlint with the template's `.oxlintrc.json`. create-vite 9.4.0 ships oxlint, not ESLint, and the request is to keep the template's linter. (default, not asked)
- **Yes:** malformed responses and unknown error codes are `network-error`. The Vite proxy answers with a plain-text 500 when the backend is down, and the user should see the network message then. (default, not asked)
- **Yes:** the client's 10 s timeout uses `setTimeout` and its own `AbortController`, not `AbortSignal.timeout`, so tests can drive it with Vitest fake timers. (default, not asked)
- **Yes:** every digit counts towards the 12-digit limit, including the `0` in `0.5`. It bounds the entry at 14 characters. (default, not asked)
- **Yes:** `√` and `±` right after an operator use the accumulator as the operand, and the result becomes the second operand. Both apply to the displayed number, as asked for `√`. (default, not asked)
- **Yes:** an operator right after another replaces it. (default, not asked)
- **Yes:** requests run in a hook effect keyed on `pending`, and the reducer matches responses by `id`. The reducer stays pure and testable without timers. (default, not asked)
- **Yes:** a return to the initial state keeps `nextId`. With ids restarting at 0, a late response from before `clear` could match the next request in the reducer, and only the hook's abort check would stop it. (asked during implementation)
- **Yes:** the longest-entry example is `-1234567890.12`, not `-123456789012.`, which the rule that ignores the point at 12 digits makes impossible to type. The exponent switch happens at six or more leading zeros after the point, as `0.0000001` shows. Both were text errors; behaviour is unchanged. (asked during implementation)
- **Yes:** pending keys use `aria-disabled`, not `disabled`. A `disabled` button loses focus, which would drop keyboard users to the page body after every `=`. (default, not asked)
- **Yes:** the server's `message` is not shown. SPEC 01 says it may change without notice; the frontend owns its wording. (default, not asked)
- **Yes:** `npx -y create-vite@9.4.0` instead of `npm create vite@9.4.0 ... -- ...`. The `npm create` form relies on the `--` separator reaching npm, and PowerShell can consume it when it runs the `npm.ps1` shim. The `npx` form has no separator and was checked to scaffold the `react-ts` template. (default, not asked)
- **Yes:** `src/main.tsx` is excluded from coverage. It only mounts the root component. (default, not asked)
- **Yes:** the template's `src/App.tsx` is deleted and `main.tsx` renders `Calculator`. A wrapper with one child adds nothing. (default, not asked)
- **Yes:** `defineConfig` from `vitest/config` in `vite.config.ts`, not a separate `vitest.config.ts`. One config file for the dev server, build and tests. (default, not asked)

## Risks

| Risk                                                                                                   | Mitigation                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| In development, React StrictMode runs effects twice, so each step starts a request and aborts it at once. | The hook ignores aborted outcomes, so the display is right. Production builds send one request per step. Component tests render without StrictMode and assert one request. |
| jsdom has no layout, so the 320px and one-line display rules cannot be tested automatically.          | Two manual criteria check them in a real browser.                                                                        |
| `^` is a dead key on some layouts.                                                                      | `p` is a second shortcut for power.                                                                                      |
| AltGr reports Ctrl and Alt as held on Windows.                                                          | The modifier rule makes an exception for `AltGraph`.                                                                     |
