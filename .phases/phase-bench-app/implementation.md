# Implementation — bench-app

Status: Complete
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
- [x] `benchmark-controls.tsx`: prompt list, model multi-select, concurrency input, Run button
- [x] `result-card.tsx`: sandboxed `srcDoc` iframe preview + status badge + key metrics + open-detail trigger
- [x] `run-detail-dialog.tsx`: full per-run breakdown (text, tool calls, mistakes, cost breakdown, tokens, duration, projectId)
- [x] `report-view.tsx`: comparison table across runs + aggregate summary
- [x] Wire `App.tsx`: controls + live progress + cards grid + report; theme provider + globals.css

### Results
- Built the benchmark UI as a compare/monitor surface: control rail with editable prompts, multi-select text models, concurrency input, run/stop actions; live progress strip; aggregate report table; sandboxed result cards; and a detail dialog for text, tool calls, mistakes, costs, usage, and timing. `typecheck`, `lint`, `format:check`, and `build` passed for `@workspace/benchmark`.

### Gotchas
- The cards render the latest streamed `html_update`; runs that fail before any edit show an empty/error state rather than fetching project HTML.

## Phase 5: DOX + lockfile + final verification

### Description
Files: `apps/benchmark/AGENTS.md`, `apps/AGENTS.md` Child DOX Index, `pnpm-lock.yaml`.

### Todo
- [x] Write `apps/benchmark/AGENTS.md`
- [x] Add `apps/benchmark/` to `apps/AGENTS.md` Child DOX Index + ownership line
- [x] Run `pnpm install` to finalize lockfile
- [x] Full gate: typecheck, lint, format:check, build for `@workspace/benchmark`; confirm server/client untouched

### Results
- Added benchmark app DOX and registered `apps/benchmark/` in `apps/AGENTS.md`. `pnpm install` was already up to date. Focused benchmark gates passed: `typecheck`, `lint`, `format:check`, and `build`. Headed `agent-browser` smoke test loaded `http://localhost:5175/`, verified controls, checked model toggle + concurrency input interactions, and showed no page errors or benchmark console errors beyond normal Vite/React dev messages. Server/client source files had pre-existing uncommitted changes and were not staged for this phase.

### Gotchas
- Did not click `Run benchmark` during the browser smoke test because the real server was running on `localhost:3001`; clicking it would start live OpenRouter calls.

## Phase 6: Visual QA fixes for running report and detail dialog

### Description
Files: `apps/benchmark/src/App.tsx`, `apps/benchmark/src/components/report-view.tsx`, `run-detail-dialog.tsx`, `theme-toggle.tsx`, and `apps/benchmark/AGENTS.md`. Fix issues caught from actual screenshots: unfinished runs displayed fake report averages (`0ms`, `$0`, score `0`) and detail dialog tool calls collapsed into a skinny unreadable column. Add the requested fixed header/footer + scrollable content behavior and a benchmark-local theme toggle.

### Todo
- [x] Make report rows state-aware so unfinished runs show `—` for score/averages until terminal data exists
- [x] Rebuild the detail dialog as a wide overflow-safe layout with fixed header/footer and scrollable content panes
- [x] Keep the benchmark app shell fixed at desktop size so the top header and sidebar footer stay visible while content scrolls
- [x] Add a benchmark-local light/dark theme toggle stored under `benchmark-theme`
- [x] Verify with headed `agent-browser` screenshots of running, detail, light, and dark states
- [x] Run focused benchmark `format:check`, `typecheck`, `lint`, and `build`

### Results
- Report table now includes a State column and suppresses fake score/average metrics until a model has terminal run data.
- Detail dialog now explicitly overrides the shared dialog `sm:max-w-sm`, uses `92vw`/`72rem` width, removes the problematic full-dialog `ScrollArea`, fixes header/metrics/footer rows, and makes the middle content panes scrollable.
- Desktop app shell now uses fixed-height overflow containment so the top run header and sidebar run footer stay visible while the main/sidebar content scrolls.
- Added `ThemeToggle`, an app-local light/dark toggle persisted in `localStorage` under `benchmark-theme`; no production client theme code is imported.
- Headed `agent-browser` visual verification captured:
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-running-fixed.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-detail-wide-fixed.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-header-toggle-light.png`
  - `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-header-toggle-light-after-click.png`
- Focused benchmark gates passed: `format:check`, `typecheck`, `lint` (`0` errors), and `build`.

### Gotchas
- `agent-browser click` did not trigger the run/stop buttons reliably in this app state, but `focus` + `Enter` did. Visual verification used the keyboard path for Run/Stop.
