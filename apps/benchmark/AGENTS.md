# Benchmark App DOX

## Purpose

- Owns the standalone Vite/React benchmark app for comparing landing-page agent text models against the real server `/agent` SSE stream.

## Ownership

- `src/App.tsx`: benchmark shell, live progress, report, card grid, and run-detail dialog wiring.
- `src/components/`: benchmark-only controls, result cards, detail dialog, and aggregate report UI.
- `src/hooks/use-benchmark.ts`: run orchestration, concurrency pool, abort/stop handling, project creation, and SSE folding.
- `src/lib/`: server API helpers, SSE transport, result reducer, domain types, and formatting helpers.

## Local Contracts

- This app is benchmark-only and must stay separate from the production client and server UI code.
- Benchmark runs vary the text model (`textModel`) because text/tool-calling quality is the target; image and vision models use server defaults unless explicitly added as benchmark axes.
- Each run creates a disposable draft project through `POST /api/projects` and streams one `POST /agent` request with `{ prompt, projectId, textModel }`.
- `screenshot_request` events are answered with a deterministic error; the benchmark app does not capture browser screenshots for server screenshot tools.
- Result previews render streamed `html_update` HTML in sandboxed `srcDoc` iframes after expanding project image URLs to absolute server URLs.

## Work Guidance

- Use shared UI through `@workspace/ui` and shared model/domain formatters through `@workspace/prompt-panel`.
- Keep benchmark state local to this app; do not move benchmark-only orchestration into the production client.
- Keep concurrency conservative for real model calls; default to `1` unless a test explicitly needs parallelism.

## Verification

- `pnpm --filter @workspace/benchmark typecheck`
- `pnpm --filter @workspace/benchmark lint`
- `pnpm --filter @workspace/benchmark format:check`
- `pnpm --filter @workspace/benchmark build`
- Browser smoke test with `agent-browser` after UI changes: load the Vite app, verify controls render, run/stop affordances are accessible, and no console/runtime errors appear on initial load.

## Child DOX Index

No child AGENTS.md files currently exist.
