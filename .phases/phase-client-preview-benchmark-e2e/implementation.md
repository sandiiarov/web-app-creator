# Implementation — client-preview-benchmark-e2e

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
- `[phase-name]` — the task slug (this folder's `client-preview-benchmark-e2e`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Extract shared landing preview package without behavior change

### Description
Create `@workspace/landing-preview`, move the production iframe/screenshot/morph helpers into it, repoint the client to the package, and keep existing client behavior/checks green.

### Todo
- [x] Create `@workspace/landing-preview` package and move preview/screenshot modules
- [ ] Repoint client imports and remove/re-export obsolete app-local preview modules
- [ ] Update package DOX/workspace dependencies and run focused package/client checks

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 2: Add preview diagnostics and imperative screenshot capture API

### Description
Add opt-in preview diagnostics and an imperative preview handle in `@workspace/landing-preview` so benchmark can capture screenshots and iframe diagnostics without importing client code.

### Todo
- [ ] Add diagnostics types/callbacks and preview handle to the shared package
- [ ] Add tests for diagnostics/screenshot helper behavior
- [ ] Re-run package/client focused checks

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Replace benchmark raw iframes and forced screenshot errors with shared client preview runtime

### Description
Use the shared preview runtime in benchmark cards, answer screenshot requests with real client-side capture, and persist preview/screenshot diagnostics in run results and saved reports.

### Todo
- [ ] Add benchmark preview registry and real screenshot response path
- [ ] Replace result-card iframes with shared `LandingPreview`
- [ ] Extend run/report types with preview diagnostics and screenshot captures
- [ ] Update report tests and run focused benchmark checks

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 4: Add zoomable benchmark previews and richer detail inspection

### Description
Add accessible zoom controls to each benchmark preview and expose a larger detail preview alongside the existing text/tool/stats diagnostics.

### Todo
- [ ] Add card-level zoom controls around shared previews
- [ ] Add large preview inspection to run details
- [ ] Verify zoom UI with headed browser screenshots

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 5: DOX, final verification, and live E2E benchmark

### Description
Update durable docs, run focused verification, and perform a tiny live E2E benchmark confirming rendered previews, tool diagnostics, screenshot capture, saved report JSON, and handoff prompt.

### Todo
- [ ] Update DOX for package/client/benchmark contract changes
- [ ] Run focused checks and browser QA
- [ ] Run approved tiny live E2E and inspect saved report JSON
- [ ] Complete verification record

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
