# Server App DOX

## Purpose

- Node HTTP API for the landing-page agent.
- Streams Mastra agent progress over custom SSE, serves generated images, and owns all project-DOM screenshot capture through Cloudflare Browser Run.

## Ownership

- `src/index.ts`: custom Node HTTP server, CORS, `/agent`, `/api/projects*` REST (including `/api/projects/:id/stop` graceful run stop), `/images/:id`, `/api/projects/:id/images/:file`, and `/api/projects/:id/screenshots/:file` routing.
- `src/config*.ts`: environment parsing and runtime config, including optional Cloudflare Browser Rendering credentials.
- `src/http-body.ts`: request body reading helper.
- `src/mastra/`: Mastra agent, tools, model wiring, SSE mapping, cost accounting, Cloudflare CDP screenshot capture, and file-backed project storage.
- `.data/`: local-only persisted projects (gitignored) under `projects/<id>/` with `project.json`, `html.json`, `client-messages.jsonl` (append-only client wire: every server→client SSE event + inbound prompt), `agent-messages.jsonl` (append-only per-step Mastra `messageList` snapshots, reasoning-stripped, for agent history replay), `vision-messages.json` (per OCR/vision call), `screenshots/<NNN>-<uuid>.<ext>` (server-captured screenshot bytes), and `images/`; legacy `messages.json`/`raw-messages.json` are read-only fallback for projects persisted before this refactor; legacy project `index.html` is import-only migration input. All message logs are appended per event/step (never overwritten) so the exact data at any moment is inspectable mid-run; `flushProjectLogs` awaits pending appends before a run closes.
- `.mastra/`: generated Mastra CLI build/studio output; do not hand-edit.

## Local Contracts

- `POST /agent` accepts `{ prompt: string, projectId: string, turnId?: string, textModel?: string, imageModel?: string, visionModel?: string, attachments?: Attachment[] }` where attachments are uploaded image data URLs or selector-only element records `{ kind: 'element', selector }`; payloads are validated server-side and persisted without base64 bytes. Supplied `turnId` values are non-empty strings up to 128 characters and are persisted verbatim (omission retains a generated fallback). The process-local server accepts only one active run per project, claims it before model/title mutation, and rejects overlap without appending a second prompt/event sequence. The three model fields select the OpenRouter model for each role (text brain, image generation, vision OCR) and default to `config.openrouter.default{Chat,Image,Vision}Model`; the default chat model uses OpenRouter's `:nitro` routing variant. It streams `thinking`, `text`, `tool_call`, `html_update`, `retry`, rolling `stats`, `error`, and `done` SSE events; rolling stats update after each completed LLM step/provider-cost report and terminal tool event, then a final snapshot records the terminal reason; `html_update` carries project id, sequence, previous/current hashes, byte count, and current server-rendered HTML after successful content-changing edits. `retry` events report the retryable issue, attempt, max attempts, and backoff delay before the next Mastra-level model retry. `tool_call` events must include terminal `done`/`error` states for tool results and errors. The agent edits the project's anchored `html.json` document through `read`/`find` anchors and anchor-range `edit` operations; stale snapshot failures instruct a fresh `read`/`find`, malformed or balance failures return a correction reason, and the server stops repeated edit failures. Clients use `html_update` for live preview morphing, but `GET /api/projects/:id` remains the canonical full project read path.
- JSON bodies are bounded while streaming: `/agent` allows at most 24 MiB encoded, while project create/PATCH allow 64 KiB; overflow returns JSON `413` before route side effects. Attachment limits use decoded bytes for uploaded images (8 MiB each, 16 MiB aggregate); selector-only element attachments contribute 0 bytes. Declared uploaded attachment `size` must exactly match the decoded data URL.
- The server defaults to loopback `HOST=127.0.0.1` and one exact `CLIENT_ORIGIN=http://localhost:5173`. Present browser origins must match that configured HTTP(S) origin exactly; mismatches (including `null` and OPTIONS) receive JSON `403` before route side effects. Origin-less CLI/server requests remain allowed. Allowed responses advertise only the configured origin with `Vary: Origin`. A non-loopback bind is unauthenticated and requires an operator-controlled network boundary.
- Project REST API (file-backed via `src/mastra/lib/project-store.ts` under `.data/projects/<id>/`):
  - `GET /api/projects` → list metadata, drafts (no HTML) hidden.
  - `POST /api/projects { title?, model? }` → create draft (seeded with the placeholder page).
  - `GET /api/projects/:id` → full project (metadata + `indexHtml` + persisted `messages`).
  - `PATCH /api/projects/:id { textModel, visionModel?, imageModel? }` → persist the per-role model selection (`textModel` required; `visionModel`/`imageModel` optional but validated when present); `project.json` RMW is synchronous, so this can't lose a concurrent edit's `hasHtml` write.
  - `DELETE /api/projects/:id` → remove project + images.
  - `POST /api/projects/:id/stop` → gracefully stop the active run for the project: aborts attachment analysis, Cloudflare capture, or the Mastra stream but leaves the SSE response open so terminal `stats` + explicit stopped state + `done` are still delivered (returns `{ ok, stopped }`, `stopped=false` when no run is active).
  - `GET /api/projects/:id/images/:file` → serve a persisted project image.
  - `GET /api/projects/:id/screenshots/:file` → serve a persisted screenshot under `screenshots/`.
- `GET /images/:id` serves process-memory images created by the image generation tool.
- Optional env: `OPENROUTER_API_KEY` (required for any model calls), `OPENROUTER_API_URL`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_VISION_MODEL`, `CLIENT_ORIGIN`, `HOST`, `PORT`, `FIRECRAWL_API_KEY`, `FIRECRAWL_CREDIT_USD` (default `0.002`), `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (required for server-side screenshot capture via Cloudflare Browser Run; their absence produces a concise configuration error only when capture is invoked), `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PROJECT_ID`, `AGENT_MODEL_MAX_RERIES`, `AGENT_STREAM_ERROR_MAX_RETRIES`, `AGENT_RETRY_BASE_DELAY_MS`, `AGENT_RETRY_MAX_DELAY_MS`, `AGENT_MAX_COST_USD` (per-run USD cap, default `1`; set `0` to disable, checked after each LLM/image/vision cost accrual and hard-aborts the run with an `error` SSE event when exceeded), `AGENT_TEMPERATURE` (GLM-5.2 sampling temperature, default `1`; tune EITHER this OR `AGENT_TOP_P`, never both), `AGENT_TOP_P` (optional nucleus-sampling override; when set it replaces `AGENT_TEMPERATURE` on the wire).
- Run lifetime: browser/SSE request closure is delivery loss, not cancellation. Explicit `POST /api/projects/:id/stop` remains authoritative. Accepted runs continue to terminal persistence in the same server process after a client disconnect; process restart and multi-process durability are out of scope.
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

- `src/mastra/AGENTS.md` — Mastra agent implementation, tools, SSE mapping, Cloudflare capture, and model/cost logic.
