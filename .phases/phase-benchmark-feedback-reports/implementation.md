# Implementation — benchmark-feedback-reports

Status: In Progress
Prerequisite: plan.md `Status: Complete`

> **Purpose:** execute the plan one slice at a time. Small increments, commit each todo, run checks after each sub-phase.

## Guidance

- **One sub-phase = one slice from the plan.** Work them in order. Don't jump ahead.
- **Implement the smallest amount** that satisfies the slice. No speculative abstractions, no polish on unrelated code.
- **Run the checks** discovered in research after each sub-phase, not just at the end.
- **Stay in scope.** If a sub-phase reveals more work than planned, record it and return to planning — don't silently expand the slice.

## Commit rule — one commit per todo item

When a todo is genuinely done (file saved, test passing), commit it on its own:

```
<repo-convention-subject> [phase-name][phase-N][todo-item-slug]
```

- `<repo-convention-subject>` — follow the repo's existing convention. Inspect `git log --oneline -20` and any `.gitmessage` / Conventional Commits config; fall back to a plain descriptive imperative subject if none is detectable.
- `[phase-name]` — the task slug (this folder's `benchmark-feedback-reports`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Server report persistence endpoint

### Description
Implement `POST /api/benchmark-reports` with a file-backed store under `apps/server/.data/benchmark-reports`, route validation, and server route tests.

### Todo
- [x] Add the server benchmark report store, route, validation, and tests

### Results
- Added `apps/server/src/mastra/lib/benchmark-report-store.ts` to write benchmark report JSON files under `apps/server/.data/benchmark-reports/<id>.json` and return `{ id, savedAt, path, bytes }` metadata.
- Added `POST /api/benchmark-reports` in `apps/server/src/index.ts` with validation for `reportVersion` and `runs`.
- Added server route coverage for successful report save/readback and invalid payload rejection in `apps/server/src/index.test.ts`.
- Checks passed:
  - `pnpm --filter @workspace/server format:check`
  - `pnpm --filter @workspace/server typecheck`
  - `pnpm --filter @workspace/server lint` (`0` errors)
  - `pnpm --filter @workspace/server test` (`17` files, `118` tests, lines `90.32%`)
  - `pnpm --filter @workspace/server build`

### Gotchas
- Tests create local JSON under ignored `apps/server/.data/benchmark-reports` and remove the file path they create; generated report artifacts remain outside git.

## Phase 2: Client report builder, save panel, and clipboard handoff prompt

### Description
Build the benchmark report JSON from current run data, add the server save API helper, and add a feedback/save panel that copies an agent handoff prompt referencing the saved report path.

### Todo
- [ ] Add report builder, save helper, feedback form, save action, and clipboard prompt UI

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Dynamic prompt management

### Description
Change the initial state to one prompt and add unlimited add/remove prompt controls while preserving run-count and validation behavior.

### Todo
- [ ] Add single initial prompt plus add/remove prompt controls

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 4: DOX and closeout verification

### Description
Update benchmark/server DOX and complete focused checks plus browser visual verification.

### Todo
- [ ] Update DOX and run final focused verification

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
