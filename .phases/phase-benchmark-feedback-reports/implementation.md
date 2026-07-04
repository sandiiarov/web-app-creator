# Implementation — benchmark-feedback-reports

Status: Complete
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
- [x] Add report builder, save helper, feedback form, save action, and clipboard prompt UI

### Results
- Added report JSON/domain types in `apps/benchmark/src/lib/types.ts` and `apps/benchmark/src/lib/report.ts`.
- Added a coding-agent handoff prompt helper that names the saved report path and asks the next agent to inspect tool behavior, cost, model choice, generated output, reliability, and user feedback.
- Added `saveBenchmarkReport` to `apps/benchmark/src/lib/server-api.ts` for `POST /api/benchmark-reports`.
- Added `apps/benchmark/src/components/report-save-panel.tsx` with structured user feedback fields, save/loading/success/error states, automatic clipboard copy on save, and manual copy fallback.
- Wired the panel into `apps/benchmark/src/App.tsx` after the live report.
- Added `apps/benchmark/src/lib/report.test.ts` for report JSON and handoff prompt coverage.
- Checks passed:
  - `pnpm --filter @workspace/benchmark format:check`
  - `pnpm --filter @workspace/benchmark typecheck`
  - `pnpm --filter @workspace/benchmark lint` (`0` errors)
  - `pnpm --filter @workspace/benchmark test` (`1` file, `2` tests)
  - `pnpm --filter @workspace/benchmark build`

### Gotchas
- Clipboard writes can be blocked by the browser; the UI still shows the generated prompt in a read-only textarea with a manual `Copy prompt` button after save.

## Phase 3: Dynamic prompt management

### Description
Change the initial state to one prompt and add unlimited add/remove prompt controls while preserving run-count and validation behavior.

### Todo
- [x] Add single initial prompt plus add/remove prompt controls

### Results
- Reduced benchmark initial state to one default prompt in `apps/benchmark/src/App.tsx`.
- Added client-side prompt creation/removal handlers with no artificial upper limit and a guard that preserves at least one prompt.
- Added `Add` and per-row `Remove` controls to `apps/benchmark/src/components/benchmark-controls.tsx`; controls disable while a benchmark is running.
- Run-count and existing validation behavior remain derived from `prompts.length * models.length` and non-empty prompt text.
- Checks passed:
  - `pnpm --filter @workspace/benchmark format`
  - `pnpm --filter @workspace/benchmark typecheck`
  - `pnpm --filter @workspace/benchmark lint` (`0` errors)
  - `pnpm --filter @workspace/benchmark test` (`1` file, `2` tests)
  - `pnpm --filter @workspace/benchmark build`

### Gotchas
- Newly added prompts start blank, intentionally disabling `Run benchmark` until the user writes the prompt.

## Phase 4: DOX and closeout verification

### Description
Update benchmark/server DOX and complete focused checks plus browser visual verification.

### Todo
- [x] Update DOX and run final focused verification

### Results
- Updated `apps/benchmark/AGENTS.md` for dynamic prompts, structured feedback, saved report JSON, and copied handoff prompt behavior.
- Updated `apps/server/AGENTS.md` for `POST /api/benchmark-reports` and generated `.data/benchmark-reports/<id>.json` files.
- Final focused checks passed:
  - `pnpm --filter @workspace/benchmark format:check`
  - `pnpm --filter @workspace/benchmark typecheck`
  - `pnpm --filter @workspace/benchmark lint` (`0` errors)
  - `pnpm --filter @workspace/benchmark test` (`1` file, `2` tests)
  - `pnpm --filter @workspace/benchmark build`
  - `pnpm --filter @workspace/server format:check`
  - `pnpm --filter @workspace/server typecheck`
  - `pnpm --filter @workspace/server lint` (`0` errors)
  - `pnpm --filter @workspace/server test` (`17` files, `119` tests, lines `90.31%`)
  - `pnpm --filter @workspace/server build`
- Headed `agent-browser` safe visual QA passed without clicking `Run benchmark`:
  - Verified initial state has exactly one prompt and a disabled `Save report` button with no runs.
  - Verified `Add` creates a blank second prompt, disables `Run benchmark`, and shows remove controls.
  - Verified removing the blank prompt returns to one prompt and re-enables `Run benchmark`.
  - Verified feedback fields accept input and problem-area checkboxes toggle.
  - Verified theme toggle still works.
  - `agent-browser console` showed only Vite/React dev messages; `agent-browser errors` showed none.
- Screenshots captured:
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/benchmark-feedback-initial.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/benchmark-feedback-added-prompt.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/benchmark-feedback-removed-prompt.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/benchmark-feedback-filled-light.png`

### Gotchas
- Browser QA intentionally did not click `Run benchmark`, so save-success UI was covered by unit/server route tests rather than a live model run.
