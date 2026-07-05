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
- [x] Repoint client imports and remove/re-export obsolete app-local preview modules
- [x] Update package DOX/workspace dependencies and run focused package/client checks

### Results
- New package `@workspace/landing-preview` (`packages/landing-preview/`) is a JIT/source-consumed React package mirroring `@workspace/prompt-panel` conventions; it owns `LandingPreview`, `captureElementScreenshot`, `captureProjectScreenshot`, `preview-morph`, and `preview-srcdoc`.
- Screenshot wire types (`ScreenshotResponseInput`, `ScreenshotViewportSize`, `ScreenshotMediaType`, `SCREENSHOT_VIEWPORT_SIZES`) now live in the package and are re-exported by `apps/client/src/lib/landing-agent.ts`.
- Client now imports `LandingPreview` and `captureProjectScreenshot` from `@workspace/landing-preview`; deleted `apps/client/src/components/landing-preview.tsx(.test.ts)`, `apps/client/src/lib/browser-screenshot.ts`, `apps/client/src/lib/preview-morph.ts`, and `apps/client/src/lib/preview-srcdoc.ts`.
- Client no longer directly depends on `@zumer/snapdom`; it depends on `@workspace/landing-preview`.
- DOX: added `packages/landing-preview/AGENTS.md`, registered it in `packages/AGENTS.md`, and updated `apps/client/AGENTS.md` ownership bullets for moved modules.
- Checks: `@workspace/landing-preview` format/typecheck/lint/test (1 file, 4 tests) pass; `@workspace/client` format/typecheck/lint/test/build (1 file, 5 tests) pass. The only lint output is the pre-existing `main.tsx` fast-refresh warning unrelated to this slice.

### Gotchas
- Several client files (`projects-api.ts`, `projects-page.tsx`, `landing-agent.test.ts`) were already dirty from unrelated model-selection work; commits stage explicit paths only and leave those untouched.
- `ScreenshotViewportSize` is imported into `apps/client/src/lib/landing-agent.ts` for the request event type and re-exported; the package owns the canonical definition to avoid a package → app import.

## Phase 2: Add preview diagnostics and imperative screenshot capture API

### Description
Add opt-in preview diagnostics and an imperative preview handle in `@workspace/landing-preview` so benchmark can capture screenshots and iframe diagnostics without importing client code.

### Todo
- [x] Add diagnostics types/callbacks and preview handle to the shared package
- [x] Add tests for diagnostics/screenshot helper behavior
- [x] Re-run package/client focused checks

### Results
- `LandingPreview` is now a plain function component (React 19 `ref`-as-prop) exposing a `LandingPreviewHandle` via `useImperativeHandle`: `captureScreenshot({ selector })` captures the requested element from the live preview iframe, and `isReady()` reports document readiness.
- Added opt-in diagnostics: new `onPreviewDiagnostic?(diagnostic)` prop emits `PreviewDiagnostic` events for iframe `load`, `ready`, runtime `error` (message/source/line/col), and unhandled promise rejections; listeners attach after iframe load and detach on cleanup.
- Added public types `LandingPreviewHandle`, `LandingPreviewScreenshotInput`, `PreviewDiagnostic`, `PreviewConsoleLevel`, and per-kind diagnostic types; exported from `src/index.ts`.
- Switched away from `forwardRef(function …)` after tsgo/oxfmt both failed to parse that wrapper inside `.tsx`; the plain-function + ref-prop pattern compiles cleanly under React 19.
- Tests grew from 4 to 8: added screenshot helper coverage for `SCREENSHOT_VIEWPORT_SIZES`, `getScreenshotViewportDimensions`, and `getPaddedScreenshotSize` (default + custom padding).
- Checks: `@workspace/landing-preview` format/typecheck/lint (clean, no warnings)/test (8 tests) pass; `@workspace/client` typecheck/lint (only pre-existing `main.tsx` warning)/build pass.

### Gotchas
- `forwardRef(function Named(props, ref) { … })` triggers a parse failure in tsgo and oxfmt inside `.tsx`; the repo targets React 19, so `ref` as a regular prop avoids the hazard entirely.
- oxlint `perfectionist/sort-union-types` mismatches when one union member is multi-line (oxfmt expands long object types) and others are single-line; extracting diagnostic members into named interfaces/types sorts consistently.
- `useImperativeHandle` deps are intentionally `[]` because handle methods read `iframeRef.current` lazily; the exhaustive-deps warning is suppressed with an inline disable matching the repo convention.

## Phase 3: Replace benchmark raw iframes and forced screenshot errors with shared client preview runtime

### Description
Use the shared preview runtime in benchmark cards, answer screenshot requests with real client-side capture, and persist preview/screenshot diagnostics in run results and saved reports.

### Todo
- [x] Add benchmark preview registry and real screenshot response path
- [x] Replace result-card iframes with shared `LandingPreview`
- [x] Extend run/report types with preview diagnostics and screenshot captures
- [x] Update report tests and run focused benchmark checks

### Results
- Benchmark now depends on `@workspace/landing-preview` and answers `screenshot_request` SSE events with real client-preview captures via `captureProjectScreenshot` (the same path the production editor uses), instead of the forced `"Benchmark does not capture browser screenshots."` error.
- Added `postScreenshotResponse` (success) alongside `postScreenshotError` (now the capture-failure fallback) in `apps/benchmark/src/lib/server-api.ts`.
- `useBenchmark` exposes `recordScreenshotCapture` and `recordPreviewDiagnostic`; each screenshot request records `{ requestId, selector, viewportSize, status, dimensions, mediaType, dataUrlBytes }` (or `errorMessage`) on the run, and preview runtime errors/load/ready events flow into `previewDiagnostics`.
- `RunResult` and `BenchmarkReportRun` now carry `previewDiagnostics` and `screenshotCaptures`; `BenchmarkRunConfig.screenshotCapture` moved from `'disabled-fast-error'` to `'client-preview-capture'`.
- `run-reducer.ts` now exports `ScreenshotRequest` and forwards `selector`/`viewportSize` to the hook.
- `ResultCard` renders the shared `LandingPreview` (new `iframeClassName` prop sizes it to the card) instead of a raw `allow-same-origin` iframe, so benchmark previews use the production iframe preparation, morphing, sandbox, and diagnostics path.
- `LandingPreview` gained an optional `iframeClassName` prop; the client keeps its default full-viewport sizing.
- Report builder/test updated for the new capture mode and run fields.
- Checks: benchmark format/typecheck/lint (0 errors)/test (2 tests)/build all pass.

### Gotchas
- `useBenchmark` screenshot handling needs `setResults`, so the capture helper accepts a `record` callback (the hook provides `recordScreenshotCapture`) rather than touching state from a module-level function.
- Screenshot requests can arrive before the visible preview morphs; the capture path renders from the latest streamed `result.html` in an offscreen iframe at the requested viewport (matching the client), so it does not depend on the visible card preview being ready.

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
