# Mastra Agent DOX

## Purpose

- Owns the Mastra implementation of the landing-page agent and its custom server-side streaming protocol.

## Ownership

- `agents/`: landing-page agent factory and singleton registration config.
- `tools/`: Mastra tool factories and the landing tool registry, including scrape/read/find/edit/generate_image/screenshot; legacy grep helpers may remain internal but are not public landing tools.
- `skills/`: self-contained browser design guidance for the landing-page agent.
- `lib/`: OpenRouter model config, OpenRouter vision OCR, browser screenshot response registry, cost accounting, anchored HTML document/edit/find/image/SSE helpers, and file-backed project storage (`project-store.ts`).
- `route.ts` maps Mastra `fullStream` chunks to the client-facing SSE protocol. It accepts `projectId`, validates the project exists, sets the title from the prompt, builds a project-scoped write-through store, and records each completed turn to the project's `messages.json`. After successful content-changing `edit` results, it streams `html_update` with project id, sequence, previous/current hashes, byte count, and current server-rendered HTML so the client can morph the preview without a full project fetch. Mastra-level model retries emit a `retry` SSE event with the issue, attempt, max attempts, and backoff delay before waiting and retrying. Mastra `tool-error` chunks must be surfaced as terminal `tool_call` events with `state: "error"` and the error message. After an `edit` failure, the run must require a successful `read` or `find` before another `edit`; 10 repeated edit failures stop the run instead of allowing blind retries.
- `index.ts`: Mastra instance, storage, logger, and observability setup.

## Local Contracts

- The agent edits the project's anchored `html.json` document via a write-through store (`createProjectHtmlStore`). Tools must not mutate repository files, and `html.json` is the single source of truth — the UI never writes HTML. `index.html` is legacy import-only input and must not be written as a mirror. Initial/fallback project reads use `getProject`; live edit updates use rendered `html_update` SSE payloads derived from the write-through store and are not persisted into message turns.
- The project title is set server-side from the first prompt (`setTitleIfUntitled`) on `POST /agent`; the selected model is persisted to project metadata at run start while each saved message turn keeps the model used for that turn.
- Project conversation history is server-owned and partially LLM-visible: `streamLandingAgent` replays persisted user prompts plus prior assistant text/error summaries into the OpenRouter agent call before the current prompt, but does not replay prior thinking or tool-call display rows as assistant prose. It records the same prompt/text/thinking/tool/stats/error shape it streams to the client and appends a finalized non-streaming turn to `messages.json` when the request finishes. Prompt image attachments are OCR analyzed before the OpenRouter agent run; selected-element attachments also pass their captured `outerHTML` into agent context alongside screenshot OCR. Only attachment metadata, selected-element HTML, and OCR summaries are saved in `messages.json`, never base64 image bytes.
- User-facing agent text should stay concise, use the latest user prompt's language (English when English or ambiguous), and must not echo internal tool transcripts such as `Tool read done`, `Intent:`, `Detail:`, or `Result:`; the UI renders tool status separately.
- Every user-visible tool call must include an `intent`; the client renders it in the conversation UI. Tools that accept an `intent` should receive one from the agent; `screenshot` derives its displayed intent from `selector` and `viewportSize` because its input schema has only those two fields.
- Mastra `tool-result` chunks with top-level `{ ok: false }` are terminal failures for the custom SSE protocol and must stream and record `tool_call.state = "error"` even when the SDK chunk `isError` flag is false.
- `tools/landing-tools.ts` is the source of truth for enabled tools, tool count/list, and tool guidance.
- Additions or removals of tools must update SSE mapping, cost accounting, client event types, and this DOX when behavior changes.
- `read` and `find` return compact anchored lines as `anchor|text` plus checksum/line metadata. `find` defaults to literal search and supports optional regex/context. `edit` must accept `edits: [{ operation, range, text }]` batches where operations are `replace`, `delete`, `insert_before`, and `insert_after`, ranges are `[]`, `[anchor]`, or `[startAnchor, endAnchor]`, and range endpoints are inclusive. Edits resolve against the original anchored document, validate atomically, preserve untouched anchors, allocate fresh anchors for inserted/replaced lines, write through to the project store on success, and return concise metadata/changed anchors instead of full HTML.
- `openrouterModel()` (`lib/openrouter-model.ts`) uses Mastra `OpenAICompatibleConfig` with ids shaped as `openrouter/${modelId}` so the synthetic prefix is stripped and the full OpenRouter model id is sent verbatim to `openrouter.ai/api/v1/chat/completions`. OpenRouter is the only provider for all agent LLM traffic (text brain), image generation, and vision OCR. All three roles are selectable per request via `/agent { textModel?, imageModel?, visionModel? }` and default from `config.openrouter.default{Chat,Image,Vision}Model`. Main agent retries are configured through `config.agentRetry`; hidden AI SDK model retries default to `0` so user-visible Mastra retry events own backoff reporting unless overridden by env.
- `resolveModelId()` strips an optional `openrouter/` prefix and falls back to the **chat** default only. It is correct for `textModel`, but the `/agent` handler must forward `undefined` for omitted `imageModel`/`visionModel` so `streamLandingAgent`'s `StreamOptions` destructuring defaults apply the role-specific image/vision models. Routing image/vision through `resolveModelId` silently substitutes the chat model (neither image nor vision capable) and 404s at the provider — this is what the benchmark hit when it sent only `textModel`.
- Vision OCR uses the configured OpenRouter vision model (default `moonshotai/kimi-k2.7-code`); image generation uses OpenRouter's `/api/v1/images` endpoint with the configured image model (default `bytedance-seed/seedream-4.5`). OpenRouter cost accounting must use only provider-reported response metadata (`cost`, `total_cost`, `estimated_cost`, or nested cost objects) and must not estimate USD from tokens or image counts. LLM streaming must request raw chunks and capture provider cost metadata when present; when metadata is absent, the OpenRouter cost is `0`. Firecrawl scrape cost is calculated from Firecrawl-reported `creditsUsed` multiplied by `config.firecrawl.creditUsd` (default `0.002`, override with `FIRECRAWL_CREDIT_USD`). Project reads must not normalize legacy zero-cost stats from saved token usage.
- The `screenshot` tool accepts exactly `selector` and `viewportSize` (`mobile` | `tablet` | `desktop`), emits a project-correlated `screenshot_request` SSE event, waits on the process-local browser screenshot registry, OCRs the returned selector screenshot with the configured OpenRouter vision model, and returns visual QA notes without creating files or auxiliary artifacts. Client capture renders the requested viewport and adds 8px padding around the selected element image.
- `design-skill.ts` is self-contained browser design guidance. Its instructions and references must keep the agent anchored to the project HTML document as the only editable surface and must use `read`/`find` anchors before `edit` ranges.
- The image store is process-memory during a live `generate_image` call; `createProjectHtmlStore`'s sync write path copies those bytes into `.data/projects/<id>/images/` and rewrites their URLs to `/api/projects/:id/images/<file>` as the agent edits the document. The in-memory image store is source only during a run; the project `html.json` file is the source of truth.

## Work Guidance

- For Mastra changes, read installed package docs/types first; Mastra APIs change quickly.
- Keep per-request `Agent` + `HtmlStore` isolation for production requests; the singleton registration exists for Mastra Studio visibility.
- Prefer `zod` schemas at tool boundaries and small pure helpers in `lib/`.

## Verification

- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server test`
- `pnpm --filter @workspace/server build`

## Child DOX Index

- None.
