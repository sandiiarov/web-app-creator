# Implementation — bench-app

Status: In Progress
Prerequisite: plan.md `Status: Complete`

> **Purpose:** execute the plan one slice at a time. Small increments, commit each todo, run checks after each sub-phase.

## Guidance

- **One sub-phase = one slice from the plan.** Work them in order. Don't jump ahead.
- **Implement the smallest amount** that satisfies the slice. No speculative abstractions, no polish on unrelated code.
- **Run the checks** discovered in research after each sub-phase, not just at the end.
- **Stay in scope.** If a sub-phase reveals more work than planned, record it and return to planning — don't silently expand the slice.

## Commit rule — one commit per todo item

Commits use the repo convention: `<type>(benchmark): <subject> [bench-app][phase-N][todo-slug]`, scoped with explicit paths to `apps/benchmark/` (the worktree has unrelated pre-existing changes that must not be swept in).

## Phase 1: Scaffold the app shell and config (builds + dev server runs)

### Description
Files: `apps/benchmark/package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`, `src/main.tsx`, `src/App.tsx` (placeholder).

### Todo
- [x] Create `apps/benchmark/package.json` with workspace name + catalog deps + scripts and `#components`/`#hooks`/`#lib` imports
- [x] Create `apps/benchmark/index.html`, `tsconfig.json`, `vite.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`, `vitest.config.ts`
- [x] Create `src/main.tsx` + placeholder `src/App.tsx` rendering a title; import `@workspace/ui/globals.css`
- [x] Run `pnpm install` to register the workspace package and resolve deps
- [x] Verify `pnpm --filter @workspace/benchmark build` succeeds

### Results
- Scaffold committed (`2d8bc7e5`). `pnpm install` registered 11 workspace projects (benchmark added). `build` succeeds (85ms, 16 modules). `typecheck`, `lint`, `format:check` all clean. Globals.css `@source '../../../apps/**/*.{ts,tsx}'` auto-scans benchmark classes; no shared CSS edit needed. Zero edits outside `apps/benchmark/`.

### Gotchas
- `pnpm install` reported a pre-existing peer-dependency warning (unrelated to benchmark).

## Phase 2: Server API + SSE transport layer (typed, no UI)

### Description
Files: `apps/benchmark/src/lib/sse-client.ts`, `server-api.ts`, `types.ts`, `format.ts`.

### Todo
- [x] Copy `streamSSE` POST client into `src/lib/sse-client.ts`
- [x] Add `src/lib/server-api.ts` (SERVER_URL, createProject, getProject, expandProjectImageUrls, postScreenshotResponse)
- [x] Add `src/lib/types.ts` (run/result/mistake/tool-summary types; reuse `CostBreakdown`/`TokenUsage`/`ToolCallState` from `@workspace/prompt-panel`)
- [x] Add `src/lib/format.ts` re-exporting formatters from `@workspace/prompt-panel` plus a `formatModelLabel` helper
- [x] Verify `pnpm --filter @workspace/benchmark typecheck` passes

### Results
- Transport layer committed (`398c9d47`). Added typed POST SSE parsing, project CRUD/image expansion helpers, screenshot-error response helper, benchmark result/domain types, and formatting helpers. `pnpm --filter @workspace/benchmark typecheck` passed.

### Gotchas
- Screenshot capture is intentionally not implemented in the benchmark app; screenshot tool requests must be answered with an error so runs do not hang waiting for a browser capture.

## Phase 3: Orchestration hook — run benchmark and collect results

### Description
Files: `apps/benchmark/src/lib/run-reducer.ts`, `src/hooks/use-benchmark.ts`.

### Todo
- [x] Implement a pure `runResultReducer(result, event)` in `src/lib/run-reducer.ts` folding SSE events into a `RunResult`
- [x] Implement `src/hooks/use-benchmark.ts` driving the matrix with concurrency, per-run AbortController, and `stop`
- [x] Answer `screenshot_request` promptly via `postScreenshotResponse({ error })`
- [x] Verify `pnpm --filter @workspace/benchmark typecheck` passes

### Results
- Added `applySseEvent` reducer for `text`, `tool_call`, `html_update`, `retry`, `screenshot_request`, `stats`, `error`, and `done` events. Added `useBenchmark` to create one project per prompt/model pair, run the `/agent` SSE stream with `textModel`, fold live updates into results, enforce a concurrency pool, support abort/stop, and answer screenshot requests with a fast benchmark-specific error. `typecheck`, `lint`, and `format:check` passed for `@workspace/benchmark`.

### Gotchas
- Benchmark runs vary only the text model because text/tool-calling quality is the benchmark target; image and vision models use server defaults.

## Phase 4: UI — controls, result cards (iframe previews), and report

### Description
Files: `apps/benchmark/src/components/benchmark-controls.tsx`, `result-card.tsx`, `run-detail-dialog.tsx`, `report-view.tsx`, plus `App.tsx` composition.

### Todo
- [ ] `benchmark-controls.tsx`: prompt list, model multi-select, concurrency input, Run button
- [ ] `result-card.tsx`: sandboxed `srcDoc` iframe preview + status badge + key metrics + open-detail trigger
- [ ] `run-detail-dialog.tsx`: full per-run breakdown (text, tool calls, mistakes, cost breakdown, tokens, duration, projectId)
- [ ] `report-view.tsx`: comparison table across runs + aggregate summary
- [ ] Wire `App.tsx`: controls + live progress + cards grid + report; theme provider + globals.css

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 5: DOX + lockfile + final verification

### Description
Files: `apps/benchmark/AGENTS.md`, `apps/AGENTS.md` Child DOX Index, `pnpm-lock.yaml`.

### Todo
- [ ] Write `apps/benchmark/AGENTS.md`
- [ ] Add `apps/benchmark/` to `apps/AGENTS.md` Child DOX Index + ownership line
- [ ] Run `pnpm install` to finalize lockfile
- [ ] Full gate: typecheck, lint, format:check, build for `@workspace/benchmark`; confirm server/client untouched

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_
