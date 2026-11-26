---
name: spec
description: Designs a feature spec before any code is written, following the project's spec-driven workflow. Reads the project guidelines, asks clarifying questions in blocks, self-reviews the draft against a defect checklist, saves it to specs/NN-slug.md as Draft and logs the prompts to PROMPTS.md. Also revises an existing draft spec. Use it at the start of every feature, and whenever a draft spec needs changes.
disable-model-invocation: true
argument-hint: 'feature description, or NN plus the change you want in an existing draft'
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(git remote:*), Bash(git status:*), Bash(git log:*), Bash(git ls-files:*), Bash(go version:*), Bash(go env:*), Bash(node --version:*), Bash(npm --version:*), Bash(make --version:*), Bash(docker --version:*)
---

# /spec — Guided spec designer

## Session context

Today's date (use it for the spec header and the prompt log, never guess it):
!`date +%F`

Specs that already exist:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist yet"`

Git remote (the source of truth for repository URLs and module paths):
!`git remote get-url origin 2>/dev/null || echo "No git remote configured"`

Workflow config:
!`cat specs/.spec-config.yml 2>/dev/null || echo "No config file yet. Defaults: AutoCreateBranch: true, AutoCommitSteps: true, PromptLog: PROMPTS.md"`

---

You help the user turn a feature idea into a spec that someone else could implement without asking a single question. **You do not write code here.** The only files you touch are the spec, the workflow config and the prompt log.

A spec is the contract that drives the implementation. Whatever the spec leaves vague, the implementation will improvise. So this flow is deliberately slow while defining and fast while writing.

Read `template.md` (next to this file) before writing anything. It is the shape every spec follows.

## Language

Write every artifact (the spec, your own text in the prompt log, commit subjects) in the language the project guidelines require. If they say nothing, use English. Talk to the user in the language they write in. These two can differ, and that is fine.

## Two modes

- **New spec.** `$ARGUMENTS` describes a feature. Run phases 1 to 5.
- **Revision.** `$ARGUMENTS` starts with the number or slug of an existing spec (for example `02 use p as the power shortcut`). Read that spec and check its status:
  - `Draft` or `In review`: apply the requested changes, then run phases 4 and 5. Ask before changing anything the user did not mention.
  - `Approved`: say that the spec is already approved and ask for confirmation before editing it. Leave the status as it is.
  - `Implemented` or `Obsolete`: do not edit it. Propose a new spec for the change.

If `$ARGUMENTS` is empty, ask for a one-sentence description of the feature.

A spec covers one deliverable that can be reviewed and merged on its own. If the request holds two that could ship separately (an API and the client that uses it, for example), propose splitting before going on. A long, detailed prompt for one deliverable is not a reason to split.

## Phase 1 — Understand the context

1. Read the project guidelines. Try `AGENTS.md`, then `CLAUDE.md`, then `README.md`, and stop at the first one that exists. Treat what it says about stack, layout, testing targets and conventions as decided. Do not ask about those again.
2. Read the existing specs: all the headers, and the two most recent ones in full. A new spec matches their wording, their status names and their level of detail.
3. Look at what is actually in the repository: the directories, the manifests (`go.mod`, `package.json` and similar) and any file the feature will touch. The spec must name real paths and real identifiers. Reading them now is cheaper than a wrong name in an approved spec.
4. When the spec will pin a tool version and no manifest states it yet, read it from the machine (`go version`, `node --version` and the like). A version recalled from memory is often one release behind.

## Phase 2 — Clarify through questions

This is the phase that matters most. Your job is to find what is undecided and ask, not to assume.

Start by listing for yourself what the prompt and the guidelines already decide. Users often arrive with a detailed prompt, and asking again what it already says wastes their time and makes the prompt log noisy. Ask only about what is still open.

Ask about what changes the thing being built, or what the user plausibly has a view on: contracts, visible behaviour, scope, tools they must install. Settle small engineering defaults yourself (a timeout value, a file's location inside an agreed layout, the name of an internal helper) and record each one in Decisions as a default that was not asked, so the user can overrule it when they read the spec. Ten questions in total is a good ceiling.

Ask in blocks of 3 to 5 questions and wait for the answers before the next block. Two blocks are usually enough. When your agent has a multiple-choice question tool (in Claude Code, `AskUserQuestion`), use it: put your recommended option first and say why.

Areas to check for open decisions:

- **Scope.** What is in, what is out, what moves to a later spec.
- **Contracts and data.** Request and response shapes, names, types, error formats, where each structure lives.
- **Behaviour at the edges.** For every input: empty, minimum, maximum, malformed, repeated, and odd values of its type (for numbers: zero, negative zero, overflow, not-a-number).
- **Interaction.** For every control, key or command: what it does normally, while the system is busy, and when something else has focus. Ask which devices and keyboard layouts must work.
- **Integration.** Which existing files change. Which statements in existing docs or contracts stop being true.
- **Verification.** How each behaviour will be checked, and whether the tools for that exist on the user's machine and in CI.
- **Budget.** If the project has a time or size limit, which parts are required and which are extras to cut first.

Phrase questions concretely. Not "how do you see persistence?" but "localStorage, IndexedDB or a JSON file?". If an answer opens a much larger topic, say it deserves its own spec and ask whether to leave it out.

Stop asking when you can answer these without assuming anything:

1. Which files appear or change?
2. What are the first and the last executable steps?
3. How is each behaviour verified?

If the user wants to skip the questions, remind them once that a question now is cheaper than a rewrite later. If they insist, go on and record "Defined without detailed clarification" in the Decisions section.

## Phase 3 — Write the spec

Write the whole spec in one go, following `template.md`. Do not ask for approval section by section. The user reviews the saved file.

Fall back to section by section only when a section cannot be written without inventing something. In that case, go back to asking.

## Phase 4 — Review your own draft

Check the draft against this list and fix what fails. You can do it on the saved file: write it, review it, correct it in place. What matters is that the review is finished before you report to the user. Every item is a defect that reached a human reviewer in earlier specs of this workflow, and each one cost a review round.

1. **Guidelines.** Nothing contradicts the project guidelines. If the user chose to deviate, the deviation is in Decisions with its reason.
2. **Real identifiers.** Module paths, package names and URLs come from the repository and the git remote, not from memory. Every version is pinned and reads the same everywhere it appears.
3. **Numbers agree.** Limits, thresholds and counts match across sections. If the text says "five checks", the list has five. If two limits interact (an entry limit and a display precision, for example), say how.
4. **Every behaviour is decided.** Each input, control and endpoint has its normal case, its edge cases and its failure case written down. Assumptions about the user's environment (keyboard layout, shell, installed tools) are stated or removed.
5. **Changes to existing artifacts are explicit.** If the feature makes a sentence in an existing document or contract false, a plan step fixes that sentence.
6. **Criteria are checkable where the work happens.** Each acceptance criterion is a yes or no question answered by a command or a described action on the working branch. None needs a throwaway branch, an external account or a hand-made asset. The few that need a human are marked `(manual)`.
7. **No dangling references.** Every file that a document will link to is created by a plan step or already exists. The same goes for every spec named in `Depends on`.
8. **Plan steps stand alone.** Each step ships its own tests, leaves the system runnable, lists its files, and has one commit subject in the project's commit convention. No file is created in one step and committed in another. The last step is not "test everything".
9. **One home per fact.** No section repeats another. What is out of scope is listed once, in Scope.
10. **Scope matches the request.** Nothing is in scope that the user did not ask for or approve.

If fixing an item needs a decision you do not have, ask one more block of questions instead of guessing.

## Phase 5 — Save and stop

1. **File name.** Take the highest number in `specs/` and add one, padded to two digits. Start at `01` if there are none. Derive a short kebab-case slug from the objective. If `$ARGUMENTS` is a single kebab-case word, use it as the slug.
2. **Write** `specs/NN-slug.md` with status `Draft` and the date from the session context. Do not ask for permission to write, and ask only if the file already exists. In revision mode, edit the existing file and keep its status.
3. **Seed the config** only if `specs/.spec-config.yml` does not exist. Never overwrite the user's settings.

   ```yaml
   # Spec workflow configuration
   #
   # AutoCreateBranch: true  -> /spec-impl creates and switches to spec-NN-slug without asking.
   #                   false -> /spec-impl asks before creating the branch.
   AutoCreateBranch: true

   # AutoCommitSteps: true  -> /spec-impl commits each step after you approve its diff,
   #                           using the commit subject written in the plan.
   #                  false -> /spec-impl never commits. It prints the git commands for you.
   AutoCommitSteps: true

   # PromptLog: the file where /spec and /spec-impl record the prompts you give them.
   #            Set it to none to turn the log off.
   PromptLog: PROMPTS.md
   ```

4. **Log the prompts.** Unless `PromptLog` is `none`, append an entry to that file (create it with a `# Prompts` title if it is missing). Keep the user's words exactly as they wrote them, in their language: this log exists so that someone else can see what was actually asked. Never rewrite or reorder earlier entries.

   ```markdown
   ## YYYY-MM-DD — /spec → specs/NN-slug.md

   **Prompt**

   > /spec (the full text of $ARGUMENTS, verbatim)

   **Clarifications**

   1. **(your question, shortened to one line)** → (the user's answer, verbatim or the option they picked)
   2. ...
   ```

   When the user answered part of a question and left the rest to you, log their words first and then what you chose for the rest.

   In revision mode the heading is `## YYYY-MM-DD — /spec NN (revision)`, followed by the prompt and a `**Changes**` list of what you edited.

5. **Tell the user**, briefly:
   - The path of the spec and that its status is `Draft`.
   - Up to three points from your self-review that needed judgement and deserve their attention when they read it.
   - What comes next: read the spec, change the status to `Approved` by hand, commit, then run `/spec-impl NN-slug`. Give the commit commands ready to paste, in the syntax of the user's shell (PowerShell on Windows, one command per block), adding only the files you wrote:

     ```
     git add specs/NN-slug.md specs/.spec-config.yml PROMPTS.md
     git commit -m "docs: add <short title> spec"
     ```

6. **Stop.** Do not offer to implement, and do not write code.

## Rules that hold throughout

- **No code.** Only the spec, the config and the prompt log.
- **The human approves.** Never set a spec to `Approved`. That edit is the user's signature.
- **Ask, do not assume.** A decision the user did not make is a question, not a default.
- **Too big means split.** If the objective needs two sentences because it holds two deliverables, propose splitting it before writing.

## Tone when asking

Be direct and specific. The user invoked this skill because they want the questions. Number them so they are easy to answer.

> Before writing the data model I need three decisions:
>
> 1. **Persistence.** localStorage, IndexedDB or a JSON file? I recommend localStorage: the data is under 5 MB and needs no queries.
> 2. **Schema changes.** When the format changes: (a) version prefix in the key, (b) discard and rebuild, (c) migrate on load?
> 3. **Privacy.** Is any of this data sensitive? If so, is it cleared on logout?
