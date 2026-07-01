# Implementation — project-messages

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
- `[phase-name]` — the task slug (this folder's `project-messages`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Add file-backed project message storage

### Description
Implement `messages.json` persistence in `apps/server/src/mastra/lib/project-store.ts` and focused tests for creating, reading, and appending message turns.

### Todo
- [x] Add project message storage helpers and tests.

### Results
- Implemented `messages.json` in `apps/server/src/mastra/lib/project-store.ts` with `ProjectMessageTurn`/part types, `appendProjectMessageTurn`, new-project empty message initialization, `getProject(...).messages`, and missing-file fallback.
- Added `apps/server/src/mastra/lib/project-store.test.ts` covering empty histories, append/read, and missing `messages.json` fallback.
- Checks passed: `pnpm --filter @workspace/server typecheck`; `pnpm --filter @workspace/server exec vitest run --config vitest.config.ts src/mastra/lib/project-store.test.ts`; `pnpm --filter @workspace/server exec oxlint src/mastra/lib/project-store.ts src/mastra/lib/project-store.test.ts`.

### Gotchas
- Tests create temporary ignored project folders under `apps/server/.data/projects/` and clean them with `deleteProject` after each test.

## Phase 2: Persist streamed agent turns server-side

### Description
Record each run-local turn in `apps/server/src/mastra/route.ts`, append it to project messages in `finally`, and update Mastra DOX for the new server-side history contract.

### Todo
- [ ] Save streamed agent turns to project message history.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Restore project messages in the client editor

### Description
Extend client project types and `useLandingPage` loading so persisted turns render in the prompt panel when a project is reopened; update client DOX.

### Todo
- [ ] Load persisted project messages into the prompt panel.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
