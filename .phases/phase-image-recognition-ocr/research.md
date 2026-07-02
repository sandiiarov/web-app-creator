# Research — image-recognition-ocr

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Map prompt submission, attachment-adjacent UI, and client SSE handling

### Description
Answer how a user prompt currently leaves the browser, how the prompt panel is composed, how custom SSE events are parsed/rendered, and where image-file attachment UI could connect. Identify inputs, outputs, side effects, and existing test patterns in client files only.

### Todo
- [x] Inspect prompt panel/composer components and app-local keyboard/menu patterns.
- [x] Inspect client agent/SSE types, streaming hook, project API, and relevant client tests.
- [x] Record facts, open questions, and client verification commands.

### Results
- Prompt entry is owned by `apps/client/src/components/prompt/prompt-panel.tsx` and `apps/client/src/components/prompt/composer.tsx`. `PromptPanel` owns the prompt string state, trims it in `sendPrompt`, calls `onSend(trimmed)`, then clears the prompt; `Composer` receives only `prompt`, `onChange`, `onSubmit`, `onKeyDown`, model props, and stop/send state.
- The composer footer currently has a model dropdown on the left and either Stop or Send on the right; there is no file input, attachment state, or image preview in `apps/client/src/components/prompt/composer.tsx`.
- `apps/client/src/components/prompt/panel-command-menu.tsx` owns navigation/layout/theme commands only. Keyboard shortcuts are centralized in `apps/client/src/lib/keyboard-shortcuts.ts`; current key types do not include attachment-related shortcuts.
- `apps/client/src/hooks/use-landing-page.ts` sends requests with `streamSSE(LANDING_AGENT_API, { model, projectId, prompt }, ...)`. Its public `send` type is `(prompt: string) => void`, so current prompt submission cannot carry files.
- Client SSE parsing is one-way POST streaming in `apps/client/src/lib/sse-client.ts`: it JSON-stringifies one request body, reads the response body, parses `event:` / `data:` frames, and invokes `onEvent`. There is no client-to-server message path after the stream starts.
- Client event types in `apps/client/src/lib/landing-agent.ts` include `thinking`, `text`, `tool_call`, `stats`, `error`, and `done` payload shapes. `ToolCallEvent` has `detail`, `id`, `intent`, `providerId`, `result`, `state`, and `tool`; no dedicated screenshot request/response event types exist.
- Tool rows render through `apps/client/src/components/prompt/turn-steps.tsx`. Known labels are `edit`, `generate_image`, `grep`, `read`, `scrape`, `skill`, `skill_read`, and `skill_search`; unknown tool names fall back to raw tool name.
- Preview HTML is rendered by `apps/client/src/components/landing-preview.tsx` as an `iframe` with `srcDoc`, `sandbox="allow-forms allow-modals allow-popups allow-scripts"`, and no React ref or screenshot helper.
- Project HTML is pulled from the server via `getProject` and `expandProjectImageUrls` in `apps/client/src/hooks/use-landing-page.ts` and `apps/client/src/lib/projects-api.ts`; the client does not save HTML.
- `apps/client/src` currently has no `*.test.ts` or `*.test.tsx` files according to `find`; `apps/client/package.json` still defines `test` as `vitest run --config vitest.config.ts`.
- Client verification commands from DOX/package scripts: `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, `pnpm --filter @workspace/client test`, `pnpm --filter @workspace/client build`.

### Gotchas
- `streamSSE` has no bidirectional channel after `POST /agent` starts, so a screenshot tool that requires the browser to answer during a run is not supported by the current transport shape.
- The client `test` script exists, but there are no client test files at this point.

## Phase 2: Map server agent route, request body parsing, project/message persistence, and tool streaming

### Description
Answer what `POST /agent` currently accepts, how it records turns, how tool events become SSE, and how server-side project state is persisted. Identify the exact files whose behavior constrains file attachments and screenshot tool responses.

### Todo
- [x] Inspect server request/body parsing and route dispatch.
- [x] Inspect Mastra route streaming, message persistence, tool event mapping, and tests.
- [x] Inspect project/image storage behavior that could affect attached or screenshot images.
- [x] Record facts, open questions, and server verification commands.

### Results
- `apps/server/src/index.ts` defines `AgentRequestBody` as `model?: string`, `projectId?: unknown`, and `prompt?: unknown`; `handleAgent` validates only non-empty string `prompt`, non-empty string `projectId`, and optional non-empty string `model`, then calls `streamLandingAgent({ modelId, projectId, prompt, request, response })`.
- `apps/server/src/http-body.ts` reads the entire request stream into memory and returns UTF-8 text. `readJson` in `apps/server/src/index.ts` parses JSON only; `/agent` does not accept multipart form data or binary request bodies today.
- CORS in `apps/server/src/index.ts` allows `content-type` and methods `GET,POST,PATCH,OPTIONS`; the router also implements project `DELETE` even though the allow-methods header omits it.
- `apps/server/src/mastra/route.ts` owns `streamLandingAgent`. It verifies the project exists, persists the selected model, sets title from the prompt if untitled, creates a project-bound `HtmlStore`, creates a per-request landing agent, starts SSE, and loops over `stream.fullStream` chunks.
- Custom SSE events are written by `apps/server/src/mastra/lib/sse.ts` as `event: <type>` plus JSON `data`. `streamLandingAgent` currently sends `thinking`, `text`, `tool_call`, `stats`, `error`, and `done`.
- Tool-call display and persistence are handled entirely inside `apps/server/src/mastra/route.ts`: `tool-call`/`tool-call-input-streaming-start` create `running`/`start` `tool_call` events; `tool-result` and `tool-error` create terminal `done`/`error` events; events are also recorded into `recordedTurn.parts`.
- `ProjectMessageTurn` in `apps/server/src/mastra/lib/project-store.ts` stores `prompt`, `model`, `htmlSwaps`, `error`, and parts of types `text`, `thinking`, `tool_call`, and `stats`. It has no attachment/image fields outside tool parts.
- `appendProjectMessageTurn` appends finalized turns to `messages.json`; `getProject` returns metadata, `indexHtml`, and `messages` from `.data/projects/<id>/` in `apps/server/src/mastra/lib/project-store.ts`.
- `createProjectHtmlStore` in `apps/server/src/mastra/lib/project-store.ts` writes `index.html` synchronously on `set`, marks `hasHtml`, and rewrites generated `/images/img-N` URLs to project image URLs while copying bytes from process-memory `image-store`.
- Persisted project images can be served by `GET /api/projects/:id/images/:file` through `readProjectImage` and `serveProjectImage`; safe file names include `img-N`, `img-N.ext`, or `[a-z0-9_-]+.[a-z0-9]+` in `apps/server/src/mastra/lib/project-store.ts`.
- Agent tools are registered only in `apps/server/src/mastra/tools/landing-tools.ts`. Current tool ids are `scrape`, `read`, `grep`, `edit`, and `generate_image`.
- Landing agent instructions in `apps/server/src/mastra/agents/landing-page-agent.ts` state the agent builds/refines only `/index.html`, lists tool guidance from `LANDING_TOOL_GUIDANCE`, and requires a clear `intent` on every tool call.
- Existing server tests under `apps/server/src` are `config-env.test.ts`, `mastra/lib/edit-diff.test.ts`, `mastra/lib/project-store.test.ts`, and `mastra/skills/design-skill.test.ts`; there are no current route/SSE tests for `/agent` request bodies or tool event mapping.
- Server verification commands from DOX/package scripts: `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/server lint`, `pnpm --filter @workspace/server test`, `pnpm --filter @workspace/server build`.

### Gotchas
- The server stream is currently unidirectional after `startSse(response)`: the same `POST /agent` request body has already been consumed before tool events are emitted, so a browser-produced screenshot cannot be returned on that request without adding another request/response mechanism.
- `/agent` JSON parsing means attached image bytes would need to be encoded in JSON or routed through a separate upload/store endpoint before the current stream shape can use them.

## Phase 3: Map existing OCR/image-recognition providers and Kimi/OpenRouter/Baseten model wiring

### Description
Answer what OCR or image-analysis code already exists, how provider credentials and costs are handled, and whether model ids/providers already support `moonshotai/kimi-k2.7-code`. Capture installed SDK capabilities and environment contracts with citations.

### Todo
- [x] Inspect existing image/OCR/generate-image tools and provider helpers.
- [x] Inspect config/env, cost accounting, package dependencies, and provider docs/types already present in the repo.
- [x] Record facts about available model wiring and provider constraints.

### Results
- Existing OCR is implemented in `apps/server/src/mastra/lib/image-ocr.ts` as `ocrImages(imageUrls, prompt = DEFAULT_OCR_PROMPT)`. It normalizes image URLs, fetches each URL server-side, converts loaded image bytes to data URLs, and posts a multimodal `messages[0].content` array to `https://openrouter.ai/api/v1/chat/completions`.
- `ocrImages` is currently hardcoded to `VISION_MODEL = 'z-ai/glm-5v-turbo'` in `apps/server/src/mastra/lib/image-ocr.ts`. The default prompt asks for all visible text plus brand-relevant visual details.
- `ocrImages` requires `config.openrouter.apiKey`; if absent, it returns `ok: false`, `imagesAnalyzed: 0`, a reason, empty text, and `usage: null` instead of throwing.
- `ocrImages` extracts provider text from `message.content`, `message.reasoning`, or `message.reasoning_details[].text`, and gets usage/cost from the chat response or a follow-up OpenRouter generation lookup in `apps/server/src/mastra/lib/image-ocr.ts`.
- `apps/server/src/mastra/tools/scrape.ts` is the only current caller of `ocrImages`. `createScrapeTool` scrapes markdown/links/images/branding via Firecrawl, collects likely image URLs from Firecrawl images, markdown images, metadata image fields, and branding logo, then returns `imageOcr` in its tool output.
- There is no current `apps/server/src/mastra/tools/analyze-image.ts` file in the worktree; `apps/server/src/mastra/tools/landing-tools.ts` does not register an image-analysis or attachment-analysis tool.
- `apps/server/src/config-env.ts` requires `BASETEN_API_KEY` and optionally reads `OPENROUTER_API_KEY`; OpenRouter config currently only includes `imageApiUrl: 'https://openrouter.ai/api/v1/images'`. Chat-completions URL for OCR is hardcoded in `image-ocr.ts`.
- `apps/server/src/mastra/tools/generate-image.ts` uses OpenRouter Image API with `IMAGE_MODEL = 'bytedance-seed/seedream-4.5'`, saves returned base64 image bytes into process-memory `image-store`, and returns a hosted `/images/img-N.ext` URL.
- `apps/server/src/mastra/lib/cost.ts` has Baseten LLM pricing for `moonshotai/Kimi-K2.7-Code` and `zai-org/GLM-5.2`, image generation pricing for Seedream, and `visionCost` pricing/comments for OpenRouter `z-ai/glm-5v-turbo`.
- `apps/client/src/lib/landing-agent.ts` exposes model options `zai-org/GLM-5.2` and `moonshotai/Kimi-K2.7-Code`; these are sent to the server as agent model ids, and `apps/server/src/mastra/lib/baseten-model.ts` maps them to `baseten/<modelId>` for Mastra's OpenAI-compatible client.
- Local Baseten docs in `.firecrawl/baseten-supported-models.md` list `moonshotai/Kimi-K2.7-Code` as supported by Baseten Model APIs, but the feature support table marks its Vision column as `–`; the same table marks Kimi K2.5 and Kimi K2.6 as vision-capable.
- Local OpenRouter docs in `.firecrawl/openrouter-image-understanding.md` state image inputs use `/api/v1/chat/completions` with `content` entries of type `text` and `image_url`; image URLs may be direct URLs or base64 data URLs. Supported image content types listed there are PNG, JPEG, WEBP, and GIF.
- Local model metadata in `.firecrawl/models-dev-baseten.md` lists `moonshotai/kimi-k2.7-code` with a final `No` column where nearby vision-capable entries show `Yes`, matching the Baseten snapshot's `Vision –` row.

### Gotchas
- The user's requested model id is lowercase-ish `moonshotai/kimi-k2.7-code`, while existing client/config/cost code uses Baseten's cased id `moonshotai/Kimi-K2.7-Code`; `resolveModelId` only strips a `baseten/` prefix and does not canonicalize case.
- Current evidence says Kimi K2.7 Code is available for text/tool-calling through Baseten but is not vision-capable in the local Baseten/model snapshots. That conflicts with the request to use `moonshotai/kimi-k2.7-code` to parse images and needs either a product decision or a fallback vision-capable model/provider in planning.

## Phase 4: Map screenshot-tool feasibility and browser capture constraints

### Description
Answer what the client can screenshot today, what iframe/preview boundaries exist, and what server/client round-trip patterns could carry a screenshot response to a tool call. Capture security and serialization constraints from current code.

### Todo
- [x] Inspect preview iframe implementation and any screenshot/browser automation references in source or tests.
- [x] Inspect SSE client capabilities for bidirectional or correlated client responses.
- [x] Record facts and unresolved user/product questions.

### Results
- `apps/client/src/components/landing-preview.tsx` renders the editor preview as a full-window `iframe` with `srcDoc={html}`, `sandbox="allow-forms allow-modals allow-popups allow-scripts"`, and no `ref` prop or capture API.
- Project cards in `apps/client/src/components/projects-page.tsx` also render saved HTML in sandboxed `srcDoc` iframes, but with `sandbox=""`, `pointer-events-none`, and scaled CSS for thumbnails.
- A grep across `apps/client/src` found no existing screenshot, canvas, `toDataURL`, `postMessage`, capture, or html2canvas-style implementation. `pnpm-lock.yaml` does not show installed screenshot libraries such as `html2canvas`, `html-to-image`, `dom-to-image`, Playwright, or Puppeteer as direct app dependencies.
- `apps/client/src/lib/sse-client.ts` only supports a single JSON request body followed by one-way server-to-client SSE parsing. It has no helper for correlated follow-up POSTs while a stream is open.
- `apps/server/src/mastra/route.ts` currently maps Mastra tool chunks directly to SSE events. There is no server-side pending-client-action registry, correlation id beyond tool display/provider ids, or endpoint for the browser to post a tool response back to the active run.
- `apps/server/src/mastra/tools/landing-tools.ts` tool guidance mentions screenshots only as source-site image examples inside `scrape`; no screenshot tool is registered.
- The current agent model/tool loop expects tool execution to complete server-side inside Mastra. A client screenshot request would need to suspend or fail a server-side tool until a separate browser response arrives; no current code path does that.

### Gotchas
- The preview iframe is sandboxed without `allow-same-origin`; any implementation that expects the parent React app to inspect the iframe DOM must account for the sandbox boundary in `apps/client/src/components/landing-preview.tsx`.
- The user's phrase "send it back somehow" is an unresolved architecture question in the current transport: the code has no bidirectional SSE/WebSocket channel or pending-response endpoint today.
- Open product question: should screenshot capture mean the full editor viewport, only the landing-page iframe, or the rendered page at a fixed viewport size?
