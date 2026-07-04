# Plan — bench-app

Status: Complete
Prerequisite: research.md `Status: Complete`

> **Purpose:** turn research into an executable design — ordered, vertical slices with file paths, approach, and acceptance criteria. No code yet.

## Guidance

- **Vertical slices, not horizontal layers.** Do not plan "all the database, then all the API, then all the UI." Each sub-phase should be a working, checkable slice end-to-end. A horizontal plan ships 1200 lines before the first check.
- **One sub-phase = one independently checkable unit**, small enough to verify in one pass.
- **Ordered by dependency.** Foundations before composition.
- **Each sub-phase states:** the files it will touch, the approach, and the acceptance criteria (how you'll know it's done).
- **Integrate vs. create.** Prefer integrating into existing code when the new behavior is a natural continuation; create a new module when the responsibility is distinct. Don't touch unrelated files.
- **Reuse, don't rewrite.** Note existing utilities, helpers, and patterns from research that this plan builds on.
- **Open questions from research must be resolved** here, or surfaced to the user before proceeding.

## Architecture summary

A self-contained Vite + React app at `apps/benchmark/` that consumes the production server over HTTP/SSE (project REST + `POST /agent`) and reports landing-page generation results. Per run: create a project, stream the agent for a given prompt × text model, collect `html_update`/`tool_call`/`stats`/`error`/`retry`, then render the final page as a sandboxed iframe card and aggregate a comparison report (cost, duration, tokens, tool calls, mistakes). Production client/server source stays untouched; DOX registration and lockfile updates are required closeout artifacts.

Reused from research: POST-SSE client (copied), `expandProjectImageUrls` (copied), `@workspace/prompt-panel` formatters/types/model options, `@workspace/ui` primitives, `createReactViteConfig`/`createReactConfig` config factories, `LANDING_MODEL_OPTIONS`.

## Phase 1: Scaffold the app shell and config (builds + dev server runs)

### Description
Files: `apps/benchmark/package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`, `src/main.tsx`, `src/App.tsx` (placeholder). Approach: mirror `apps/client` config set; depend on `@workspace/vite-config`, `@workspace/oxlint-config`, `@workspace/oxfmt-config`, `@workspace/typescript-config`, `@workspace/vitest-preset`, `@workspace/ui`, `@workspace/prompt-panel`, `react`/`react-dom`/`lucide-react` via catalog; package name `@workspace/benchmark`. Run `pnpm install`. Acceptance: `pnpm --filter @workspace/benchmark build` and `dev` boot; a placeholder page renders. No edits outside `apps/benchmark/`.

### Todo
- [ ] Create `apps/benchmark/package.json` with workspace name + catalog deps + scripts (build/dev/typecheck/lint/lint:fix/format/format:check/test/test:watch) and `#components`/`#hooks`/`#lib` imports
- [ ] Create `apps/benchmark/index.html`, `tsconfig.json`, `vite.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`
- [ ] Create `src/main.tsx` + placeholder `src/App.tsx` rendering a title; import `@workspace/ui/globals.css`
- [ ] Run `pnpm install` to register the workspace package and resolve deps
- [ ] Verify `pnpm --filter @workspace/benchmark build` succeeds

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 2: Server API + SSE transport layer (typed, no UI)

### Description
Files: `apps/benchmark/src/lib/sse-client.ts`, `server-api.ts`, `types.ts`, `format.ts`. Approach: copy the POST-SSE client and `expandProjectImageUrls`; wrap project create + `/agent` streaming into typed functions; define the run/result domain types (`BenchmarkModel`, `BenchmarkPrompt`, `RunStatus`, `RunResult`, `Mistake`, `ToolCallSummary`). Acceptance: `typecheck` passes; the lib is importable. Pure data layer — no React.

### Todo
- [ ] Copy `streamSSE` POST client into `src/lib/sse-client.ts`
- [ ] Add `src/lib/server-api.ts` (SERVER_URL, createProject, getProject, expandProjectImageUrls, postScreenshotResponse)
- [ ] Add `src/lib/types.ts` (run/result/mistake/tool-summary types; reuse `CostBreakdown`/`TokenUsage`/`ToolCallState` from `@workspace/prompt-panel`)
- [ ] Add `src/lib/format.ts` re-exporting `formatCost`/`formatDuration`/`formatTokenUsage` from `@workspace/prompt-panel` plus a `formatModelLabel` helper
- [ ] Verify `pnpm --filter @workspace/benchmark typecheck` passes

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Orchestration hook — run benchmark and collect results

### Description
Files: `apps/benchmark/src/hooks/use-benchmark.ts`. Approach: a hook that, given selected models + prompts, runs the matrix (configurable concurrency), creating a project per (prompt×model) and streaming `/agent`. For each run accumulate: final HTML (last `html_update`), live text/tool_call/retry/error parts, and on `stats` capture cost/duration/tokens/finishReason. Answer `screenshot_request` with a fast error response. Produce a `RunResult` per run with mistakes (tool errors, turn error, retry count) and tool-call summary. Expose `{ runs, isRunning, run, stop, progress }`. Acceptance: `typecheck` passes; logic is unit-checkable (stream event → result reducer is a pure function).

### Todo
- [ ] Implement a pure `runResultReducer(result, event)` in `src/lib/run-reducer.ts` that folds SSE events into a `RunResult` (testable without React/network)
- [ ] Implement `src/hooks/use-benchmark.ts` driving the matrix with concurrency, per-run AbortController, and `stop`
- [ ] Answer `screenshot_request` promptly via `postScreenshotResponse({ error })`
- [ ] Verify `pnpm --filter @workspace/benchmark typecheck` passes

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 4: UI — controls, result cards (iframe previews), and report

### Description
Files: `apps/benchmark/src/components/benchmark-controls.tsx`, `result-card.tsx`, `report-view.tsx`, `run-detail-dialog.tsx`, plus `App.tsx` composition. Approach: controls = editable prompt list + model multi-select + concurrency + "Run benchmark" button; cards = grid of sandboxed `srcDoc` iframe previews (final HTML, image URLs expanded) with status badge + cost + duration + mistake count; clicking a card opens a dialog with full per-run detail (text, tool calls, mistakes, cost breakdown, token usage, projectId link). Report-view = comparison table across runs sorted by cost/pass, plus a summary header. Acceptance: `build` + `typecheck` + `lint` + `format:check` pass; the UI wires to `use-benchmark`.

### Todo
- [ ] `benchmark-controls.tsx`: prompt list, model multi-select (seeded from `LANDING_MODEL_OPTIONS`, editable), concurrency input, Run button
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
Files: `apps/benchmark/AGENTS.md`, root `apps/AGENTS.md` Child DOX Index (one line), `pnpm-lock.yaml` (via install). Approach: add benchmark child DOX (purpose/ownership/local contracts: consumes server over HTTP only, no prod source edits, screenshot fast-error limitation, project accumulation note) and register it in `apps/AGENTS.md`. Note: `apps/AGENTS.md` is a prod-adjacent doc but adding a child index entry is the required DOX closeout, not a behavior change. Acceptance: full focused benchmark gate passes and explicit staging avoids pre-existing server/client worktree edits.

### Todo
- [ ] Write `apps/benchmark/AGENTS.md`
- [ ] Add `apps/benchmark/` to `apps/AGENTS.md` Child DOX Index + ownership line
- [ ] Run `pnpm install` to finalize lockfile
- [ ] Full gate: typecheck, lint, format:check, build for `@workspace/benchmark`; confirm server/client untouched

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

### Open questions from research — resolved
- Providers: production `/agent` now uses OpenRouter-only routing. Benchmark runs vary the `textModel` field with OpenRouter text model options from `@workspace/prompt-panel`; image/vision use server defaults.
