# Server App DOX

## Purpose

- Node HTTP API for landing-page agent.
- Runs agent decoupled from requests (fire-and-forget `POST /agent`); progress streamed via `GET /api/projects/:id/events` subscribe; serves gen images; owns project-DOM screenshot capture via Cloudflare Browser Run.

## Ownership

- `src/index.ts`: custom Node HTTP server, CORS; `/agent`, `/api/projects*` REST (incl `/api/projects/:id/stop` graceful run stop), `/images/:id`, `/api/projects/:id/images/:file`, `/api/projects/:id/screenshots/:file` routing.
- `src/config*.ts`: env parsing + runtime config, incl optional Cloudflare Browser Rendering creds.
- `src/http-body.ts`: request body read helper.
- `src/mastra/`: Mastra agent, tools, model wiring, SSE mapping, cost accounting, Cloudflare CDP screenshot capture, file-backed project storage.
- `.data/`: local-only persisted projects (gitignored) under `projects/<id>/` w/ `project.json`, `html.json`, `run-state.json` (run-lifecycle `{status,turnId,startedAt,finishedAt,error}`; separate from project.json so run writes don't contend w/ model/hasHtml RMW; default `idle` when absent), `client-messages.jsonl` (append-only client wire: every server→client event + inbound prompt; `html_update` excluded — broadcast-only, full HTML, terminal HTML in html.json), `agent-messages.jsonl` (append-only per-step Mastra `messageList` snapshots, reasoning-stripped, for agent history replay), `vision-messages.json` (per OCR/vision call), `screenshots/<NNN>-<uuid>.<ext>` (server-captured screenshot bytes), `images/`; legacy `messages.json`/`raw-messages.json` read-only fallback for pre-refactor projects; legacy `index.html` import-only migration input. Message logs appended per event/step (never overwritten) so exact data inspectable mid-run; `flushProjectLogs` awaits pending appends before run release.
- `.mastra/`: generated Mastra CLI build/studio output; do not hand-edit.

## Local Contracts

- `POST /agent` accepts `{ prompt: string, projectId: string, turnId?: string, textModel?: string, imageModel?: string, visionModel?: string, attachments?: Attachment[] }`; attachments = uploaded image data URLs or selector-only element records `{ kind: 'element', selector }`; payloads validated server-side, persisted w/o base64 bytes. Supplied `turnId` = non-empty strings ≤128 chars, persisted verbatim (omission → generated fallback). Process-local server accepts one active run per project, claims before model/title mutation, rejects overlap (`409` JSON, no second prompt/event seq). Three model fields select OpenRouter model per role (text brain, image gen, vision OCR), default `config.openrouter.default{Chat,Image,Vision}Model`; default chat model uses OpenRouter `:nitro` routing variant. Returns JSON `{ ok, status:'running', turnId }` immediately (fire-and-forget); run proceeds detached, decoupled from the request. Run events (`thinking`, `text`, `tool_call`, `html_update`, `retry`, rolling `stats`, `error`, `done`) broadcast to run-bus subscribers (reopened tabs via `GET /api/projects/:id/events`); rolling stats update after each completed LLM step/provider-cost report + terminal tool event, final snapshot records terminal reason; `html_update` carries project id, seq, prev/curr hashes, byte count, current server-rendered HTML after successful content-changing edits + is broadcast-only (NOT appended to client-messages.jsonl). `retry` events report retryable issue, attempt, max attempts, backoff delay before next Mastra-level model retry. `tool_call` events must include terminal `done`/`error` states for tool results/errors. Agent edits project's anchored `html.json` doc via `read`/`find` anchors + anchor-range `edit` ops; stale snapshot failures instruct fresh `read`/`find`, malformed/balance failures return correction reason, server stops repeated edit failures. `GET /api/projects/:id` remains canonical full project read path.
- JSON bodies bounded while streaming: `/agent` ≤24 MiB encoded, project create/PATCH ≤64 KiB; overflow → JSON `413` before route side effects. Attachment limits use decoded bytes for uploaded images (8 MiB each, 16 MiB aggregate); selector-only element attachments = 0 bytes. Declared uploaded attachment `size` must exactly match decoded data URL.
- Server defaults to loopback `HOST=127.0.0.1` + one exact `CLIENT_ORIGIN=http://localhost:5173`. Present browser origins must match configured HTTP(S) origin exactly; mismatches (incl `null` + OPTIONS) → JSON `403` before route side effects. Origin-less CLI/server requests allowed. Allowed responses advertise only configured origin w/ `Vary: Origin`. Non-loopback bind = unauthenticated, requires operator-controlled network boundary.
- Project REST API (file-backed via `src/mastra/lib/project-store.ts` under `.data/projects/<id>/`):
  - `GET /api/projects` → list metadata; drafts (no HTML) hidden.
  - `POST /api/projects { title?, model? }` → create draft (seeded w/ placeholder page).
  - `GET /api/projects/:id` → full project (metadata + `indexHtml` + persisted `messages`).
  - `PATCH /api/projects/:id { textModel, visionModel?, imageModel? }` → persist per-role model selection (`textModel` required; `visionModel`/`imageModel` optional but validated when present); `project.json` RMW synchronous, so can't lose concurrent edit's `hasHtml` write.
  - `DELETE /api/projects/:id` → remove project + images.
  - `POST /api/projects/:id/stop` → gracefully stop active run for project: aborts attachment analysis, Cloudflare capture, or Mastra stream; terminal `stats` + stopped state + `done` still broadcast to subscribers (returns `{ ok, stopped }`, `stopped=false` when no run active).
  - `GET /api/projects/:id/events` → SSE subscribe: emits a `state` snapshot `{ html, models, status, turns }` (turns live-replayed via `replayClientEventsLive` so an in-flight turn stays streaming), then tails run events broadcast on the run bus. Stays open until client closes.
  - `GET /api/projects/events` → SSE subscribe: emits one `project_status { projectId, status, runTurnId, runStartedAt }` per project, then tails live status changes (driven by `setRunStatusSync` → `broadcastStatus`).
  - `GET /api/projects/:id/images/:file` → serve persisted project image.
  - `GET /api/projects/:id/screenshots/:file` → serve persisted screenshot under `screenshots/`.
- `GET /images/:id` serves process-memory images from image gen tool.
- Optional env: `OPENROUTER_API_KEY` (required for any model calls), `OPENROUTER_API_URL`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_VISION_MODEL`, `CLIENT_ORIGIN`, `HOST`, `PORT`, `FIRECRAWL_API_KEY`, `FIRECRAWL_CREDIT_USD` (default `0.002`), `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (required for server-side screenshot capture via Cloudflare Browser Run; absence → concise config error only when capture invoked), `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PROJECT_ID`, `AGENT_MODEL_MAX_RETRIES`, `AGENT_STREAM_ERROR_MAX_RETRIES`, `AGENT_RETRY_BASE_DELAY_MS`, `AGENT_RETRY_MAX_DELAY_MS`, `AGENT_MAX_COST_USD` (per-run USD cap, default `1`; set `0` to disable, checked after each LLM/image/vision cost accrual, hard-aborts run w/ `error` SSE event when exceeded), `AGENT_TEMPERATURE` (GLM-5.2 sampling temp, default `1`; tune EITHER this OR `AGENT_TOP_P`, never both), `AGENT_TOP_P` (optional nucleus-sampling override; when set replaces `AGENT_TEMPERATURE` on wire).
- Run lifetime: `POST /agent` is fire-and-forget — the run is decoupled from the request that started it, so closing the tab is delivery loss, NOT cancellation (the run continues to terminal persistence in the same server process; a reopened tab resubscribes via `GET /api/projects/:id/events` to watch it finish). Explicit `POST /api/projects/:id/stop` remains authoritative. Run-lifecycle status persisted to `run-state.json` via `setRunStatusSync` (claim=`running`, terminal=`idle`/`error`/`stopped`). On boot, `reconcileInterruptedRuns` marks any stale `running` run `interrupted` + appends a synthetic `error`+`done` to its open turn so replay renders cleanly (process-restart durability).
- Keep secrets out of logs + source; `.env` stays app-local + ignored; `apps/server/.env.example` = tracked non-secret sample to copy.
- Preserve direct-run guard around `server.listen()` so `mastra dev` can import server modules w/o binding app port.
- Mastra local stores (`mastra.db*`, `mastra.duckdb*`) = generated runtime artifacts; must stay out of source edits.

## Work Guidance

- Verify Mastra APIs against installed docs/types before changing agent, tool, storage, or observability code.
- Keep route-level validation small + explicit; tool schemas own agent tool input validation.
- Treat generated `.mastra/.build` + `.mastra/output` artifacts as disposable build output.

## Verification

- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server test` (enforces 90% line coverage)
- `pnpm --filter @workspace/server build`

## Child DOX Index

- `src/mastra/AGENTS.md` — Mastra agent implementation, tools, SSE mapping, Cloudflare capture, model/cost logic.
