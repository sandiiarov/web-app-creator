# Server App DOX

## Purpose

- Node HTTP API for the landing-page agent.
- Streams Mastra agent progress over custom SSE and serves generated in-memory images.

## Ownership

- `src/index.ts`: custom Node HTTP server, CORS, `/agent`, `/api/projects*` REST, `/images/:id`, and `/api/projects/:id/images/:file` routing.
- `src/config*.ts`: environment parsing and runtime config.
- `src/http-body.ts`: request body reading helper.
- `src/mastra/`: Mastra agent, tools, skills, model wiring, SSE mapping, cost accounting, and file-backed project storage.
- `mastra-smoke.ts`: local Mastra storage/observability boot smoke script.
- `.data/`: local-only persisted projects (gitignored); one folder per project with `project.json`, `index.html`, and `images/`.
- `.mastra/`: generated Mastra CLI build/studio output; do not hand-edit.

## Local Contracts

- `POST /agent` accepts `{ prompt: string, projectId: string, model?: string }` and streams `thinking`, `text`, `tool_call`, `stats`, `error`, and `done` SSE events. `tool_call` events must include terminal `done`/`error` states for tool results and errors. The agent edits the project's `index.html` file directly; after an exact-match edit failure, the server requires a successful `read`/`grep` before another `edit` and stops repeated edit failures. There is **no** `html` push event — the client pulls the updated HTML via `GET /api/projects/:id` after each successful `edit` tool completes.
- Project REST API (file-backed via `src/mastra/lib/project-store.ts` under `.data/projects/<id>/`):
  - `GET /api/projects` → list metadata, drafts (no HTML) hidden.
  - `POST /api/projects { title?, model? }` → create draft (seeded with the placeholder page).
  - `GET /api/projects/:id` → full project (metadata + `indexHtml`).
  - `DELETE /api/projects/:id` → remove project + images.
  - `GET /api/projects/:id/images/:file` → serve a persisted project image.
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
