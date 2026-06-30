# Server App DOX

## Purpose

- Node HTTP API for the landing-page agent.
- Streams Mastra agent progress over custom SSE and serves generated in-memory images.

## Ownership

- `src/index.ts`: custom Node HTTP server, CORS, `/agent`, and `/images/:id` routing.
- `src/config*.ts`: environment parsing and runtime config.
- `src/http-body.ts`: request body reading helper.
- `src/mastra/`: Mastra agent, tools, skills, model wiring, SSE mapping, cost accounting.
- `mastra-smoke.ts`: local Mastra storage/observability boot smoke script.
- `.mastra/`: generated Mastra CLI build/studio output; do not hand-edit.

## Local Contracts

- `POST /agent` accepts `{ prompt: string, model?: string }` and streams `thinking`, `text`, `tool_call`, `html`, `stats`, `error`, and `done` SSE events.
- `GET /images/:id` serves process-memory images created by the image generation tool.
- Required env: `BASETEN_API_KEY`.
- Optional env: `BASETEN_MODEL`, `BASETEN_API_URL`, `CLIENT_ORIGIN`, `HOST`, `PORT`, `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`, `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PROJECT_ID`.
- Keep secrets out of logs and source; `.env` stays app-local and ignored.
- Preserve the direct-run guard around `server.listen()` so `mastra dev` can import server modules without binding the app port.
- Mastra local stores (`mastra.db*`, `mastra.duckdb*`) are generated runtime artifacts and must stay out of source edits.

## Work Guidance

- Verify Mastra APIs against installed docs/types before changing agent, tool, storage, or observability code.
- Keep route-level validation small and explicit; tool schemas own agent tool input validation.
- Keep generated `.mastra/.build` and `.mastra/output` artifacts treated as disposable build output.

## Verification

- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server test`
- `pnpm --filter @workspace/server build`

## Child DOX Index

- `src/mastra/AGENTS.md` — Mastra agent implementation, tools, skills, SSE mapping, and model/cost logic.
