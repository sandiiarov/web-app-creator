# Benchmark App DOX

## Purpose

- Owns the standalone Vite/React benchmark app for comparing landing-page agent text models against the real server `/agent` SSE stream and producing saved JSON handoff reports for coding-agent improvement passes.

## Ownership

- `src/App.tsx`: benchmark shell, live progress, report, card grid, and run-detail dialog wiring.
- `src/components/`: benchmark-only controls, result cards, detail dialog, report save/feedback panel, theme toggle, and aggregate report UI.
- `src/hooks/use-benchmark.ts`: run orchestration, concurrency pool, abort/stop handling, project creation, and SSE folding.
- `src/lib/`: server API helpers, SSE transport, result reducer, report JSON builder, domain types, and formatting helpers.

## Local Contracts

- This app is benchmark-only and must stay separate from the production client and server UI code.
- Benchmark runs vary the text model (`textModel`) because text/tool-calling quality is the target; image and vision models use server defaults unless explicitly added as benchmark axes.
- The app starts with one prompt. Users may add/remove prompts without a hard-coded upper limit, but the UI must preserve at least one editable prompt.
- Each run creates a disposable draft project through `POST /api/projects` and streams one `POST /agent` request with `{ prompt, projectId, textModel }`.
- `screenshot_request` events are answered with a deterministic error; the benchmark app does not capture browser screenshots for server screenshot tools.
- Result previews render streamed `html_update` HTML in sandboxed `srcDoc` iframes after expanding project image URLs to absolute server URLs.
- The benchmark app owns a local light/dark theme toggle stored in `localStorage` under `benchmark-theme`; do not import the production client theme provider.
- The report save flow collects structured user feedback, builds a JSON report with run config, summary, model aggregates, run-level stats/tool calls/mistakes/output HTML, and posts it to `POST /api/benchmark-reports`.
- After a report saves, the app must generate and copy a coding-agent handoff prompt that references the returned server file path; keep a visible manual-copy fallback because browser clipboard writes can fail.

## Work Guidance

- Use shared UI through `@workspace/ui` and shared model/domain formatters through `@workspace/prompt-panel`.
- Keep benchmark state local to this app; do not move benchmark-only orchestration into the production client.
- Keep concurrency conservative for real model calls; default to `1` unless a test explicitly needs parallelism.

## Verification

- `pnpm --filter @workspace/benchmark typecheck`
- `pnpm --filter @workspace/benchmark lint`
- `pnpm --filter @workspace/benchmark format:check`
- `pnpm --filter @workspace/benchmark build`
- Browser smoke test with `agent-browser` after UI changes: load the Vite app, verify controls render, prompt add/remove works without live model calls, report feedback/save states are reachable, run/stop affordances are accessible, fixed header/footer regions stay visible while content panes scroll, the theme toggle switches light/dark, and no console/runtime errors appear on initial load.

## Child DOX Index

No child AGENTS.md files currently exist.
