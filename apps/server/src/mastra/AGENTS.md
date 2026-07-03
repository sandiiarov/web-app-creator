# Mastra Agent DOX

## Purpose

- Owns the Mastra implementation of the landing-page agent and its custom server-side streaming protocol.

## Ownership

- `agents/`: landing-page agent factory and singleton registration config.
- `tools/`: Mastra tool factories and the landing tool registry, including scrape/read/grep/edit/generate_image/screenshot.
- `skills/`: self-contained browser design guidance for the landing-page agent.
- `lib/`: Baseten model config, Baseten Kimi vision OCR, browser screenshot response registry, cost accounting, edit/grep/html/image/SSE helpers, and file-backed project storage (`project-store.ts`).
- `route.ts` maps Mastra `fullStream` chunks to the client-facing SSE protocol. It accepts `projectId`, validates the project exists, sets the title from the prompt, builds a project-scoped write-through store, and records each completed turn to the project's `messages.json`. There is no `html` event: the client pulls HTML via `GET /api/projects/:id` after each successful `edit`. Mastra-level model retries emit a `retry` SSE event with the issue, attempt, max attempts, and backoff delay before waiting and retrying. Mastra `tool-error` chunks must be surfaced as terminal `tool_call` events with `state: "error"` and the error message. After an `edit` exact-match failure, the run must require a successful `read` or `grep` before another `edit`; 10 repeated edit failures stop the run instead of allowing blind retries.
- `index.ts`: Mastra instance, storage, logger, and observability setup.

## Local Contracts

- The agent edits the project's `index.html` file directly via a write-through store (`createProjectHtmlStore`). Tools must not mutate repository files, and the server file is the single source of truth — the UI never writes HTML, it only reads it back (`getProject`) after each `edit`.
- The project title is set server-side from the first prompt (`setTitleIfUntitled`) on `POST /agent`; the selected model is persisted to project metadata at run start while each saved message turn keeps the model used for that turn.
- Project conversation history is server-owned and partially LLM-visible: `streamLandingAgent` replays persisted user prompts plus prior assistant text/error summaries into the Baseten agent call before the current prompt, but does not replay prior thinking or tool-call display rows as assistant prose. It records the same prompt/text/thinking/tool/stats/error shape it streams to the client and appends a finalized non-streaming turn to `messages.json` when the request finishes. Prompt image attachments are OCR analyzed before the Baseten agent run; only attachment metadata and OCR summary are saved in `messages.json`, never base64 image bytes.
- User-facing agent text should stay concise, use the latest user prompt's language (English when English or ambiguous), and must not echo internal tool transcripts such as `Tool read done`, `Intent:`, `Detail:`, or `Result:`; the UI renders tool status separately.
- Every user-visible tool call must include an `intent`; the client renders it in the conversation UI.
- `tools/landing-tools.ts` is the source of truth for enabled tools, tool count/list, and tool guidance.
- Additions or removals of tools must update SSE mapping, cost accounting, client event types, and this DOX when behavior changes.
- `read` and `grep` must expose raw unnumbered text (`rawText`/`rawMatches`) for edit inputs; numbered output is navigation-only. `edit` must accept `edits: [{ oldText, newText }]` batches (with legacy single-edit fallback), match every `oldText` against the original document, tolerate snippets copied with `read`/`grep` line-number prefixes plus leading indentation differences, require unique non-overlapping matches, preserve BOM/line endings, write through to the project store on success, and return concise diff/patch metadata instead of the full HTML.
- `basetenModel()` uses Mastra `OpenAICompatibleConfig` with ids shaped as `baseten/${modelId}`; do not switch providers or routers without re-verifying Mastra docs. Baseten is the only provider for agent LLM traffic. Main agent retries are configured through `config.agentRetry`; hidden AI SDK model retries default to `0` so user-visible Mastra retry events own backoff reporting unless overridden by env.
- Baseten Kimi (`moonshotai/Kimi-K2.7-Code`) is used for vision OCR; OpenRouter is used only for image generation services. Cost accounting prefers provider-reported costs when present; when absent, calculate fallback costs from token/image/credit usage using current rates from Baseten/OpenRouter/Firecrawl. LLM streaming must request raw chunks and capture provider `cost`/`total_cost` metadata when present before falling back to token pricing. Project reads normalize legacy zero-cost stats from saved token usage so old turns display calculated costs.
- The `screenshot` tool emits a `screenshot_request` SSE event, waits on the process-local browser screenshot registry, OCRs the returned screenshot with Baseten Kimi vision, and returns visual QA notes without creating files or auxiliary artifacts.
- `design-skill.ts` is self-contained browser design guidance. Its instructions and references must keep the agent anchored to project `/index.html` as the only editable document.
- The image store is process-memory during a live `generate_image` call; `createProjectHtmlStore`'s sync `set` copies those bytes into `.data/projects/<id>/images/` and rewrites their URLs to `/api/projects/:id/images/<file>` as the agent edits the file. The in-memory store is the source only during a run; the project file is the source of truth.

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
