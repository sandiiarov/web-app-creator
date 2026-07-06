# Server App DOX

## Purpose

- Node HTTP API for the landing-page agent.
- Streams Mastra agent progress over custom SSE, serves generated images, and accepts browser screenshot responses for agent-requested visual QA.

## Ownership

- `src/index.ts`: custom Node HTTP server, CORS, `/agent`, `/api/projects*` REST, `/api/screenshot-responses/:requestId`, `/images/:id`, and `/api/projects/:id/images/:file` routing.
- `src/config*.ts`: environment parsing and runtime config.
- `src/http-body.ts`: request body reading helper.
- `src/mastra/`: Mastra agent, tools, skills, model wiring, SSE mapping, cost accounting, and file-backed project storage.
- `.data/`: local-only persisted projects (gitignored) under `projects/<id>/` with `project.json`, `html.json`, `messages.json` (UI turns), `raw-messages.json` (server-only raw Mastra response messages for agent history replay), and `images/`; legacy project `index.html` is import-only migration input.
- `.mastra/`: generated Mastra CLI build/studio output; do not hand-edit.

## Local Contracts

- `POST /agent` accepts `{ prompt: string, projectId: string, textModel?: string, imageModel?: string, visionModel?: string, attachments?: Attachment[] }` where attachments are image data URLs or selected-element records containing `outerHTML` plus a screenshot; payloads are validated server-side and persisted without base64 bytes. The three model fields select the OpenRouter model for each role (text brain, image generation, vision OCR) and default to `config.openrouter.default{Chat,Image,Vision}Model`. It streams `thinking`, `text`, `tool_call`, `html_update`, `retry`, `screenshot_request`, `stats`, `error`, and `done` SSE events; `html_update` carries project id, sequence, previous/current hashes, byte count, and current server-rendered HTML after successful content-changing edits, while `screenshot_request` carries a project-correlated selector plus `mobile`/`tablet`/`desktop` viewport size for client capture. `retry` events report the retryable issue, attempt, max attempts, and backoff delay before the next Mastra-level model retry. `tool_call` events must include terminal `done`/`error` states for tool results and errors. The agent edits the project's anchored `html.json` document through `read`/`find` anchors and anchor-range `edit` operations; after an edit failure, the server requires a successful `read`/`find` before another `edit` and stops repeated edit failures. Clients use `html_update` for live preview morphing, but `GET /api/projects/:id` remains the canonical full project read path.
- Project REST API (file-backed via `src/mastra/lib/project-store.ts` under `.data/projects/<id>/`):
  - `GET /api/projects` → list metadata, drafts (no HTML) hidden.
  - `POST /api/projects { title?, model? }` → create draft (seeded with the placeholder page).
  - `GET /api/projects/:id` → full project (metadata + `indexHtml` + persisted `messages`).
  - `PATCH /api/projects/:id { model }` → persist the current model selection in project metadata.
  - `DELETE /api/projects/:id` → remove project + images.
  - `GET /api/projects/:id/images/:file` → serve a persisted project image.
- `POST /api/screenshot-responses/:requestId` resolves or rejects a process-local pending screenshot request created by the Mastra `screenshot` tool; accepted successful responses are base64 image data URLs plus padded element-image width/height/media type.
- `GET /images/:id` serves process-memory images created by the image generation tool.
- Optional env: `OPENROUTER_API_KEY` (required for any model calls), `OPENROUTER_API_URL`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_VISION_MODEL`, `CLIENT_ORIGIN`, `HOST`, `PORT`, `FIRECRAWL_API_KEY`, `FIRECRAWL_CREDIT_USD` (default `0.002`), `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PROJECT_ID`, `AGENT_MODEL_MAX_RETRIES`, `AGENT_STREAM_ERROR_MAX_RETRIES`, `AGENT_RETRY_BASE_DELAY_MS`, `AGENT_RETRY_MAX_DELAY_MS`.
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
- `pnpm --filter @workspace/server test` (enforces 90% line coverage)
- `pnpm --filter @workspace/server build`

## Child DOX Index

- `src/mastra/AGENTS.md` — Mastra agent implementation, tools, skills, SSE mapping, and model/cost logic.
