# Spec template

The shape every spec follows. Each section says what it is for and shows a minimal example. Do not copy the examples: they illustrate the form, and the content comes from the feature.

---

## Header

Metadata in a blockquote, exactly these four lines:

```markdown
# SPEC NN — Short, descriptive title

> **Status:** Draft
> **Depends on:** SPEC 01, SPEC 02
> **Date:** YYYY-MM-DD
> **Objective:** One sentence.
```

Valid statuses: `Draft`, `In review`, `Approved`, `Implemented`, `Obsolete`. Write `None` in `Depends on` when the spec stands alone.

The objective is one sentence that a person understands in five seconds. If it needs two, the feature is too big for one spec.

---

## Why this spec exists (optional)

Two or three sentences on the reason for the work, for specs that take a non-obvious direction or change an established pattern. Omit it for straightforward features.

---

## Scope

Two sub-blocks, both required. This is the only place where out-of-scope items are listed.

```markdown
## Scope

**In:**

- Concrete thing one.
- Concrete thing two.

**Out of scope:**

- Something that came up in the conversation and was deferred.
- Something a reader might expect to find here and will not.
```

The out-of-scope list records what was discussed and left out. Without it, the implementation tends to add those things "while we are here".

---

## Data model

The concrete structures and contracts that appear or change, with their real names: types, request and response shapes, error codes, configuration keys, file formats. Short snippets in the project's language, and tables for enumerations.

```markdown
## Data model

Request body:

    { "operation": "add", "operands": [2, 3] }

| Status | `code`             | Trigger                |
| ------ | ------------------ | ---------------------- |
| 400    | `invalid_json`     | The body is not JSON.  |
| 422    | `division_by_zero` | The divisor is zero.   |
```

When a behaviour depends on a rule (rounding, limits, key mappings, state transitions), write the rule here as a table or a list, with one row per case. If the feature introduces no data, say so in one sentence.

---

## Implementation plan

Numbered steps. Each one leaves the system working and can be reviewed and committed on its own.

```markdown
## Implementation plan

1. **Domain operations.** Add `Calculate` with `add` and `subtract` to the `calculator` package, with table-driven tests.
   - Files: `backend/internal/calculator/calculator.go`, `backend/internal/calculator/calculator_test.go`
   - Verify: `go test ./internal/calculator/` passes with 100% coverage.
   - Commit: `feat(calculator): add addition and subtraction`
2. **HTTP handler.** ...
```

Rules:

- Every step has the three sub-items: `Files`, `Verify` and `Commit`.
- `Files` lists every file the step creates or changes. A file belongs to the step that first needs it, so the commit for that step is complete.
- A step that adds behaviour adds its tests in the same step.
- `Verify` is a command with its expected result, or a short action a person can perform. It is what the implementer runs before showing the step.
- `Commit` is one subject line in the project's commit convention (Conventional Commits unless the guidelines say otherwise), in the imperative, under 72 characters. Each step has a different subject, because the implementer uses them to find where to resume.
- A step is small enough to review in one sitting. If its diff would not fit in a few screens, split it.
- Generated folders (dependencies, build output, coverage reports) are added to `.gitignore` in the step that first produces them.
- The last step is not "test everything". Checking the whole feature is what the acceptance criteria are for.

---

## Acceptance criteria

A checklist where each item is answered with yes or no.

```markdown
## Acceptance criteria

- [ ] `POST /api/v1/calculations` with `{"operation":"divide","operands":[1,0]}` returns 422 and the code `division_by_zero`.
- [ ] `go test ./...` passes and reports 100% coverage for `internal/calculator`.
- [ ] (manual) At 320px wide, every key is visible without horizontal scrolling.
```

Rules:

- State the input and the expected result. "Works well", "good UX" and "no bugs" cannot be checked.
- Each criterion can be checked on the working branch with a command or a described action. Do not write criteria that need a throwaway branch, an external account or an asset someone must produce by hand.
- Mark with `(manual)` the ones a person has to look at, and keep them few.
- The implementer ticks each box after checking it, so write criteria you would be comfortable seeing ticked.

---

## Decisions

What was considered, not only what was chosen. This section has the most value months later.

```markdown
## Decisions

- **Yes:** operands as an array. One shape for unary and binary operations.
- **No:** one endpoint per operation. Seven routes for the same validation.
```

Give each decision a short reason. Record here any deviation from the project guidelines and any place where the spec was changed during implementation.

---

## Risks (optional)

Only for risks that are not obvious. A small table:

```markdown
## Risks

| Risk                                    | Mitigation                                         |
| --------------------------------------- | -------------------------------------------------- |
| The `^` key is a dead key on some layouts. | `p` is a second shortcut for the same operation. |
```

Omit the section for small, contained features.

---

## Rules for the whole document

- **One idea per sentence.** Split long sentences.
- **Concrete names.** Not "the levels module" but `src/levels.js`. Not "a key" but the exact string.
- **Names and versions come from the repository.** Check the manifests and the git remote before writing a module path, a package name or a version.
- **No TODOs.** A TODO is a decision that was not made. Make it, or ask.
- **No repeated facts.** State each fact once and refer to it from elsewhere.
- **Describe, do not implement.** Short snippets for shapes and rules are fine. Full functions are not.
- **Plain Markdown** that renders on GitHub without extensions.
