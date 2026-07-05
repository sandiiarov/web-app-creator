# Benchmark App DOX

## Purpose

- Owns the standalone Vite/React benchmark app for comparing landing-page agent text models against the real server `/agent` SSE stream, reproducing the production client preview runtime, capturing client/server diagnostics, and producing saved JSON handoff reports for coding-agent improvement passes.

## Ownership

- `src/App.tsx`: benchmark shell, fixed role-model selection, live progress, report, card grid, and run-detail dialog wiring.
- `src/components/`: benchmark-only controls, result cards (with distinct report/preview actions), run report dialog (assistant text, tool calls, stats, mistakes, preview diagnostics, screenshots), large-preview dialog mode with mobile/tablet/desktop viewport toggles, report save/feedback panel, theme toggle, and aggregate report UI.
- `src/hooks/use-benchmark.ts`: run orchestration, concurrency pool, abort/stop handling, project creation, and SSE folding.
- `src/lib/`: server API helpers, SSE transport, result reducer, report JSON builder, domain types, and formatting helpers.

## Local Contracts

- This app is benchmark-only and must stay separate from the production client and server UI code.
- Benchmark runs vary selected text models (`textModel`) as the comparison axis. The image-generation model (`imageModel`) and vision-review model (`visionModel`) are selected once per benchmark and passed to every run.
- The app starts with one prompt. Users may add/remove prompts without a hard-coded upper limit, but the UI must preserve at least one editable prompt. The default prompt should exercise image generation and post-generation visual review without naming internal tool identifiers.
- Each run creates a disposable draft project through `POST /api/projects` and streams one `POST /agent` request with `{ prompt, projectId, textModel, imageModel, visionModel }`.
- Result previews render streamed `html_update` HTML through the shared `@workspace/landing-preview` `LandingPreview` (same `srcDoc` preparation, DOM morphing, sandbox, and diagnostics path as the production editor) after expanding project image URLs to absolute server URLs.
- `screenshot_request` events are answered with real client-preview captures via the shared `captureProjectScreenshot` (the production editor path), recording `{ requestId, selector, viewportSize, status, dimensions, mediaType, dataUrlBytes }` (or `errorMessage`) on the run. `postScreenshotError` remains only as the capture-failure fallback; the benchmark no longer forces a deterministic screenshot error.
- Result cards show a small live preview plus two distinct actions: the eye/report action opens run evidence only (assistant text, tool calls, stats, mistakes, diagnostics, screenshots) and must not duplicate the preview; the preview/maximize action opens a large preview with mobile, tablet, and desktop viewport modes. Do not reintroduce card zoom controls.
- Preview runtime diagnostics (iframe load/ready/error/unhandled rejection) flow into `RunResult.previewDiagnostics` through `useBenchmark.recordPreviewDiagnostic`.
- The benchmark app owns a local light/dark theme toggle stored in `localStorage` under `benchmark-theme`; do not import the production client theme provider.
- The report save flow collects structured user feedback, builds a JSON report with run config (text models, fixed image/vision models, all-runs-parallel policy), summary, model aggregates, run-level stats/tool calls/mistakes/output HTML, and posts it to `POST /api/benchmark-reports`.
- After a report saves, the app must generate and copy a coding-agent handoff prompt that references the returned server file path; keep a visible manual-copy fallback because browser clipboard writes can fail.

## Work Guidance

- Use shared UI through `@workspace/ui`, shared model/domain formatters through `@workspace/prompt-panel`, and the shared preview/screenshot runtime through `@workspace/landing-preview`.
- Keep benchmark state local to this app; do not move benchmark-only orchestration into the production client.
- Do not expose a concurrency control. A benchmark starts every selected prompt × text-model run in parallel; warn before live runs when cost or provider rate limits matter.

## Verification

- `pnpm --filter @workspace/benchmark typecheck`
- `pnpm --filter @workspace/benchmark lint`
- `pnpm --filter @workspace/benchmark format:check`
- `pnpm --filter @workspace/benchmark build`
- Browser smoke test with `agent-browser` after UI changes: load the Vite app, verify controls render, prompt add/remove works without live model calls, report feedback/save states are reachable, run/stop affordances are accessible, fixed header/footer regions stay visible while content panes scroll, the theme toggle switches light/dark, and no console/runtime errors appear on initial load.

## Child DOX Index

No child AGENTS.md files currently exist.
