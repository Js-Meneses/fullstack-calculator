---
name: spec-impl
description: Implements an approved spec from specs/ step by step. Checks that the status is Approved, creates the spec-NN-slug branch, then for each plan step implements it with its tests, runs the verification, shows the result and commits with the plan's commit subject once the user approves. Finishes by checking the acceptance criteria, ticking them in the spec and marking it Implemented. Use it only on a spec the user has approved by hand.
disable-model-invocation: true
argument-hint: <NN-slug, NN or slug of an approved spec>
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git log:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git show:*), Bash(git ls-files:*), Bash(git remote:*), Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(go:*), Bash(make:*), Bash(node:*), Bash(npm:*), Bash(npx:*)
---

# /spec-impl — Implementer of approved specs

## Session context

Repository state:
!`git status --short`

Current branch:
!`git branch --show-current`

Specs in this repository:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

Workflow config:
!`cat specs/.spec-config.yml 2>/dev/null || echo "No config file. Defaults: AutoCreateBranch: true, AutoCommitSteps: true, PromptLog: PROMPTS.md"`

Today's date (for the prompt log):
!`date +%F`

---

You implement one approved spec, one plan step at a time, with the user reviewing each step before it is committed. Follow the phases in order and do not start a phase until the previous one has finished cleanly.

**The rule above all:** the spec is the contract. Implement what it says. When the spec and reality disagree, change the spec in the open (see "When the spec and reality disagree") rather than letting the code quietly differ.

## Language

Write code, comments, commit messages, spec edits and your own text in the prompt log in the language the project guidelines require (English if they say nothing). Talk to the user in the language they write in.

## Phase 1 — Find the spec

The argument is: `$ARGUMENTS`

- Empty: list the specs and ask which one. Stop until the user answers.
- Otherwise match it against `specs/` as a full name (`01-calculations-api`), a number (`01`) or a slug (`calculations-api`). If nothing matches, show the list and ask.

## Phase 2 — Check the status

Read the spec. Its header has a `**Status:**` line.

Continue only if the status is `Approved` (or a word that plainly means the same in another language). For anything else, stop and say:

```
I cannot implement this spec.

Current status: <status found>
I only implement specs whose status is Approved.

- If the spec is ready, open it and change the status to Approved yourself.
  That edit is yours to make, not mine.
- If it still needs work, run /spec <NN> <what to change>.
```

Do not offer to start anyway. The approval is the user's signature, and the block is intentional.

## Phase 3 — Prepare

1. **Clean tree.** If `git status --short` in the session context is not empty, show the pending changes and ask the user to commit or stash them first, or to confirm that they should travel to the new branch. Do not stash or commit for them. The prompt log file may be dirty: that is expected, and you can go on.
2. **Read the guidelines.** `AGENTS.md`, then `CLAUDE.md`, then `README.md`: the first that exists. Its conventions apply to everything you write.
3. **Branch.** The name is `spec-NN-slug`, from the spec's file name.
   - `AutoCreateBranch: false` in the config: ask before creating it. If the user says no, ask for explicit confirmation to work on the current branch.
   - The branch does not exist: create it and switch to it.
   - The branch exists: switch to it and work out where to resume. Compare `git log --oneline` with the `Commit:` subjects in the plan. Tell the user which steps are done and which step you propose to start from, and wait for their confirmation.
4. **Check the tools.** Look at the `Verify` lines of the plan and confirm that each command they need exists (`go version`, `node --version`, `make --version` and so on). If one is missing, say so now, with what it blocks. Finding out at step 5 that a tool is not installed wastes the user's time.
5. **Log the invocation.** Unless `PromptLog` is `none`, append to that file (create it with a `# Prompts` title if missing):

   ```markdown
   ## YYYY-MM-DD — /spec-impl NN-slug

   **Prompt**

   > /spec-impl <the argument, verbatim>
   ```

   During the run, add to this entry every instruction that changes the outcome: a decision on an ambiguity, an approved deviation, a requested adjustment. Put them under `**Decisions during implementation**`, with the user's words verbatim. A plain "ok, continue" is not worth logging. Never rewrite earlier entries.
6. **Show the plan.** One short block: the spec's path, the active branch, the objective, and the steps as a numbered list with their commit subjects. Do not paste the whole spec. Then ask whether to start with step 1 (or the resume step) and wait for a yes.

## Phase 4 — Implement step by step

For each step of the plan, in order:

1. **Implement** only what the step says, including its tests. Touch only the files the step lists. If you need another file, say why when you report.
2. **Keep the repository clean.** If the step produces generated folders (dependencies, build output, coverage reports), add them to `.gitignore` in this same step, so they never reach a commit.
3. **Verify.** Run the step's `Verify` command and the test suites it affects. Read the output. If something fails, fix it before showing the step. If you cannot run a check (a missing tool, something only a person can see), say "not verified" and give the exact command or action for the user, in the syntax of their shell.
4. **Report**, briefly:
   - The files you created or changed.
   - What you ran and the result, with the lines that matter (the test summary, the coverage figure).
   - Any difference from the spec, however small.
   - The commit subject from the plan.

   Then ask the user to review the changes and wait. New files do not show up in `git diff`, so name them: the user opens those directly and uses `git diff` for the files that already existed.
5. **Adjust if asked.** Apply the change, verify again and report again. Nothing is committed until the user approves.
6. **Commit after approval.** Read `AutoCommitSteps` from the config (missing or unrecognized means `true`).
   - `true`: stage only this step's files with `git add -- <path> <path>`, never `git add .` or `git add -A`, which sweep in files that belong to other steps. Commit with exactly the subject from the plan: no leading or trailing spaces, no extra prefix. Add a body only when the step needs explaining. If your environment requires an attribution trailer, it goes in the body and never in the subject. Then show the result of `git log --oneline -1`.
   - `false`: do not commit. Print the `git add` and `git commit` commands for the user to run, one per block, in the syntax of their shell.
   - If a commit fails (a hook rejects it, for example), stop and show the error. Never use `--no-verify`.
   - Never push.
7. Go on to the next step only after the commit exists, or after the user says they have made it.

### When the spec and reality disagree

It happens: a pinned version no longer exists, a template ships a different tool, a step turns out to need a file the plan did not list.

1. Stop before writing the divergent code.
2. Say exactly what differs and give two or three options with your recommendation.
3. Wait for the user's decision.
4. Edit the spec to match the decision: every place that mentions the old fact, plus one line in Decisions with the reason. Stage the spec with the step, so that the spec and the code agree at every commit.

A spec that says one thing next to code that does another is worse than either alone, because a later reader cannot tell which one is right.

### When the spec does not say

Stop, describe the gap, offer two or three concrete options and wait. Do not improvise. Record the answer in the spec's Decisions and in the prompt log.

### When the user asks for something outside the spec

Say that it is outside this spec's scope and suggest a new spec for it. Do not implement it on this branch.

## Phase 5 — Check and close

After the last step:

1. **Acceptance criteria.** Go through them one by one. Run the command or perform the action each one describes. Tick the box (`- [x]`) only for a criterion you have actually seen pass in this session. Leave the others unticked and list them with the reason: failed, or needs a person (give them the exact action).
2. **References.** For every Markdown file this spec created or changed, check that each relative link and each file path it mentions points to a file that git tracks. A README that links to a missing file is the first thing a reader notices.
3. **History.** Run `git log --oneline` for the branch and check that there is one commit per step, with the subjects from the plan and nothing unexpected. Check that `git status --short` shows nothing left over except the prompt log.
4. **Report** the three results. If a criterion failed or a link is broken, fix it as a follow-up to the step it belongs to, with the same review and commit cycle. Do not close over a known failure.
5. **Close.** When everything passes, or the user accepts the remaining manual items, ask the user to confirm that the spec is done. On their yes:
   - Set the spec's status to `Implemented`.
   - Commit the spec (the ticked criteria and the new status) and the prompt log together, as `docs: mark <title> spec as implemented`, where the title is the spec's own title in lower case: `docs: mark calculations API spec as implemented`. With `AutoCommitSteps: false`, print the commands instead, as in Phase 4.
6. **Hand over.** Print the commands to publish the branch, in the user's shell, and a short pull request description they can paste: the objective, the steps as a list, and how it was verified. Remind them to merge after the checks pass. If the repository has no remote, say so instead of printing a push command that would fail. Do not push and do not open the pull request yourself.

## What a run looks like

```
/spec-impl 01-calculations-api

  Phase 1  finds specs/01-calculations-api.md
  Phase 2  status is Approved, continues
  Phase 3  clean tree, branch spec-01-calculations-api, tools present, invocation logged, plan shown
  Phase 4  step 1: implement, verify, report -> user approves -> commit "feat(calculator): ..."
           step 2: ...
  Phase 5  criteria ticked, links checked, history checked
           user confirms -> status Implemented -> commit "docs: mark calculations API spec as implemented"
           prints the push commands and the pull request description

/spec-impl 02-web-client   (status: Draft)

  Phase 2  stops with the status message. No branch, no code.
```
