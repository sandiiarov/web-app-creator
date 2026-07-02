# Plan — image-recognition-ocr

Status: Complete
Prerequisite: research.md `Status: Complete`

> **Purpose:** turn research into an executable design — ordered, vertical slices with file paths, approach, and acceptance criteria. No code yet.

## Guidance

- **Vertical slices, not horizontal layers.** Do not plan "all the database, then all the API, then all the UI." Each sub-phase should be a working, checkable slice end-to-end. A horizontal plan ships 1200 lines before the first check.
- **One sub-phase = one independently checkable unit**, small enough to verify in one pass.
- **Ordered by dependency.** Foundations before composition.
- **Each sub-phase states:** the files it will touch, the approach, and the acceptance criteria (how you'll know it's done).
- **Integrate vs. create.** Prefer integrating into existing code when the new behavior is a natural continuation; create a new module when the responsibility is distinct. Don't touch unrelated files.
- **Reuse, don't rewrite.** Note existing utilities, helpers, and patterns from research that this plan builds on.
- **Open questions from research must be resolved** here, or surfaced to the user before proceeding.

## Phase 1: Resolve OCR model/provider constraint

### Description
Files touched: `.phases/phase-image-recognition-ocr/plan.md` only. Approach: surface the factual conflict from research before planning implementation. Acceptance criteria: the implementation path has an explicit model/provider decision for user-uploaded image parsing and screenshot parsing.

### Todo
- [x] Get a decision for the OCR/parser model because `moonshotai/Kimi-K2.7-Code` is requested but local Baseten/model docs mark it as not vision-capable.

### Results
- User selected option 1: use the current OpenRouter vision model path for OCR/image recognition. Implementation will keep agent LLM traffic on Baseten and use OpenRouter `z-ai/glm-5v-turbo` only for OCR/visual parsing.
- `@zumer/snapdom` is selected for browser screenshot capture. Scraped package docs in `.firecrawl/snapdom-npm.md` show current stable version `2.12.9`, no dependencies, ESM import `import { snapdom } from '@zumer/snapdom'`, capture shortcuts such as `snapdom.toBlob(el, options?)`, and options including `width`, `height`, `scale`, `exclude`, `filter`, `cache`, and `placeholders`.

### Gotchas
- Kimi K2.7 Code remains the selectable Baseten agent model, but it will not be used as the image parser unless provider docs later show vision support.

## Phase 2: User-attached image parsing slice

### Description
Files touched: `apps/client/src/lib/landing-agent.ts`, `apps/client/src/hooks/use-landing-page.ts`, `apps/client/src/components/prompt/prompt-panel.tsx`, `apps/client/src/components/prompt/composer.tsx`, `apps/client/src/components/prompt/turn-message.tsx`, `apps/server/src/index.ts`, `apps/server/src/mastra/route.ts`, `apps/server/src/mastra/lib/image-ocr.ts`, `apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/mastra/lib/cost.ts`, and focused tests under `apps/server/src/mastra/lib/` or `apps/server/src/mastra/`. Approach: send image attachments as JSON data URLs with prompt submission, validate them server-side, parse them with the existing OpenRouter vision helper extended for data URLs, inject the OCR/visual transcript into the agent prompt, and persist/display attachment metadata without making the client own HTML. Acceptance criteria: a user can attach an image file in the composer, send a prompt, see attachment metadata in the user turn, see an `analyze_image` tool row start/done/error, and the agent receives the image transcript before editing `/index.html`.

### Todo
- [x] Specify exact files, data shapes, validation limits, and tests for prompt image attachments.

### Results
- Client data shape in `apps/client/src/lib/landing-agent.ts`:
  - Add `ImageAttachmentInput = { dataUrl: string; id: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name: string; size: number }`.
  - Add `LandingTurn.attachments?: ImageAttachmentMeta[]`, where metadata omits `dataUrl` and may include `analysisText?: string` only if server returns/persists it.
  - Change `UseLandingPage.send` and `PromptPanel.onSend` from `(prompt: string) => void` to `(input: { attachments: ImageAttachmentInput[]; prompt: string }) => void`.
- Client UI approach:
  - `Composer` gets an attach icon button (`Paperclip` from lucide), hidden `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif">`, one or more attachment chips with name/size/remove, and disables Send unless prompt text or attachment exists.
  - `PromptPanel` owns attachment state alongside prompt state, converts selected files with `FileReader.readAsDataURL`, enforces accepted MIME types, max 4 images, max 8 MiB per image, max 16 MiB total encoded payload estimate, and clears attachments after successful submit.
  - `TurnMessage` renders persisted attachment chips inside the user bubble without base64 bytes.
- Server request shape in `apps/server/src/index.ts`: extend `/agent` JSON body to `{ prompt: string; projectId: string; model?: string; attachments?: ImageAttachmentInput[] }`. Validate accepted MIME types, data URL prefix, size fields, count, and per/total size before calling `streamLandingAgent`.
- OCR helper approach in `apps/server/src/mastra/lib/image-ocr.ts`:
  - Add a generic `ocrImageInputs(inputs, prompt?)` that accepts `{ dataUrl, sourceLabel }` and `{ url, sourceLabel }` entries, preserving current `ocrImages(urls)` by delegating to URL inputs.
  - Keep `VISION_MODEL = 'z-ai/glm-5v-turbo'`, `OPENROUTER_API_KEY` behavior, generation stats lookup, media type validation, and `visionCost` usage.
- Route approach in `apps/server/src/mastra/route.ts`:
  - Add `attachments` to `StreamOptions`.
  - After `startSse(response)` and before `agent.stream(...)`, emit a pseudo `tool_call` for `analyze_image` with `state: 'running'`, parse attachments through `ocrImageInputs`, then emit terminal `done`/`error`. Record these parts in `messages.json` like other tool calls.
  - Build `agentPrompt = prompt + attachmentContextBlock` while keeping `recordedTurn.prompt` as the user's visible prompt and `recordedTurn.attachments` as metadata.
  - Accumulate attachment OCR usage in a new `vision` cost bucket.
- Persistence approach in `apps/server/src/mastra/lib/project-store.ts`: add optional `attachments?: ProjectMessageAttachment[]` to `ProjectMessageTurn`; do not persist uploaded base64 bytes.
- Cost/UI approach: extend `CostBreakdown` with optional `vision?: { calls: number; cost: number; images: number }` and update `turn-metadata.tsx` to show non-scrape OCR/vision cost separately from scrape OCR.
- Focused tests:
  - Unit test data URL validation/normalization and missing-key behavior in `image-ocr` without real OpenRouter calls by stubbing `fetch`.
  - Unit test project message storage round-trips `attachments` metadata.
  - If route helpers are factored pure enough, test that attachment transcripts are appended to the agent prompt and pseudo tool parts are persisted.

### Gotchas
- Do not include uploaded base64 data in persisted messages or rendered turns.
- Attachment OCR can happen before the agent edits anything, so no client HTML save path or `html` SSE event is needed.

## Phase 3: Browser screenshot tool slice using `@zumer/snapdom`

### Description
Files touched: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/client/package.json`, `apps/client/src/lib/screenshot.ts` (new), `apps/client/src/hooks/use-landing-page.ts`, `apps/client/src/lib/landing-agent.ts`, `apps/client/src/components/prompt/turn-steps.tsx`, `apps/server/src/index.ts`, `apps/server/src/mastra/route.ts`, `apps/server/src/mastra/tools/landing-tools.ts`, `apps/server/src/mastra/tools/screenshot.ts` (new), `apps/server/src/mastra/lib/browser-screenshot.ts` (new), `apps/server/src/mastra/lib/image-ocr.ts`, `apps/server/src/mastra/lib/cost.ts`, and focused tests. Approach: add a Mastra `screenshot` tool whose execute function asks the browser for a capture via SSE, waits for a correlated HTTP response, OCRs the returned image with OpenRouter vision, and returns transcript text to the agent. Acceptance criteria: when the agent calls `screenshot`, the UI shows the tool running, receives a `screenshot_request` event, captures current project HTML with SnapDOM, posts the screenshot response, the server OCRs it, the tool returns text, and stats include screenshot vision cost.

### Todo
- [x] Specify exact files, transport shape, timeout/error handling, capture target, and tests for screenshot tool round-trip.

### Results
- Dependency plan:
  - Add `@zumer/snapdom: ^2.12.9` to root `pnpm-workspace.yaml` catalog.
  - Add `@zumer/snapdom` as an `apps/client/package.json` dependency using `catalog:` and refresh `pnpm-lock.yaml` with pnpm.
- Client capture target:
  - Use `apps/client/src/lib/screenshot.ts` to capture the current `html` state, not the live sandboxed preview iframe DOM.
  - Create an offscreen same-origin `<iframe srcdoc=... sandbox="allow-same-origin">` with no `allow-scripts`, set requested `width`/`height`, wait for load/fonts, then call `snapdom.toBlob(iframe.contentDocument!.documentElement, { type: 'jpeg', quality: 0.9, width, height, scale: 1, cache: 'auto', placeholders: true })`.
  - Convert the returned Blob to `data:image/jpeg;base64,...` with `FileReader`; remove the offscreen iframe in `finally`.
- SSE/HTTP transport:
  - Add client event type `ScreenshotRequestEvent = { requestId: string; intent: string | null; width: number; height: number; format: 'jpeg'; quality: number; timeoutMs: number }` and event name `screenshot_request`.
  - In `useLandingPage`, handle `screenshot_request` by calling `captureHtmlScreenshot(html, payload)` and then `POST /api/screenshot-responses/:requestId` with `{ dataUrl, mediaType, width, height }`; if capture fails, post `{ error }`.
  - Add a small API helper in `apps/client/src/lib/projects-api.ts` or a new lib file for `sendScreenshotResponse`.
- Server pending-response bridge:
  - Add `apps/server/src/mastra/lib/browser-screenshot.ts` with a process-local registry keyed by `requestId`, functions to create a pending request with timeout, resolve it from an HTTP response, and reject/cleanup when the run ends.
  - Add `POST /api/screenshot-responses/:requestId` to `apps/server/src/index.ts`; it reads JSON, validates `dataUrl` or `error`, resolves the pending request, and returns `{ ok: true }` or 404 for unknown/expired ids. CORS must include `POST` already; method list should also include `DELETE` while touching CORS because the router supports it.
- Mastra tool:
  - Add `createScreenshotTool({ requestScreenshot })` in `apps/server/src/mastra/tools/screenshot.ts` with schema `{ intent: string; width?: number; height?: number; prompt?: string }` and output `{ ok, text, imagesAnalyzed, cost?, usage?, width, height, reason? }`.
  - Register `screenshot` in `apps/server/src/mastra/tools/landing-tools.ts`. In production `streamLandingAgent`, pass a bridge that sends `screenshot_request` SSE and waits for the registry promise. In shared Studio config, pass no bridge and return a clear unavailable result.
  - Default screenshot dimensions: current browser event request uses 1440×900 unless the tool asks for a specific width/height; clamp to a safe range such as width 320–1920 and height 320–1400; timeout 30s.
  - OCR prompt for screenshots should ask for visible layout, hierarchy, text, contrast issues, broken rendering, and actionable observations; use OpenRouter `z-ai/glm-5v-turbo` via `ocrImageInputs` with one data URL.
- Route/cost/rendering:
  - Add `screenshot` summaries to `summarizeToolArgs`/`summarizeToolResult` in `apps/server/src/mastra/route.ts`.
  - Add `screenshot` to `TOOL_LABELS` in `apps/client/src/components/prompt/turn-steps.tsx`.
  - Accumulate screenshot OCR into the same `vision` stats bucket as attachment OCR.
- Focused tests:
  - Server registry timeout/resolve/error tests for `browser-screenshot.ts`.
  - Server screenshot tool test with fake `requestScreenshot` and mocked OCR fetch.
  - Client screenshot helper can be typechecked/build-verified; browser rendering is best covered by a later manual/browser e2e because Vitest default environment is Node.

### Gotchas
- The live preview iframe remains sandboxed as-is. SnapDOM capture uses a temporary no-script same-origin iframe from the current HTML string to avoid granting the live generated page `allow-same-origin` + `allow-scripts`.
- Screenshot responses are process-local and only work for the currently running Node process; this matches current in-memory image storage behavior but should be documented.

## Phase 4: DOX, implementation commits, and verification updates

### Description
Files touched: `apps/client/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`, `apps/AGENTS.md` if verification text needs adjustment, and phase files. Approach: update durable contracts where feature behavior changes, then verify server/client focused checks. Acceptance criteria: DOX reflects image attachments, OpenRouter vision parsing, SnapDOM screenshot request/response transport, process-local screenshot registry limits, and all relevant checks are listed for implementation/verification.

### Todo
- [x] Specify DOX updates and focused verification commands.

### Results
- DOX updates:
  - `apps/client/AGENTS.md`: prompt panel supports image attachments; client sends base64 image data only with `/agent` requests; client handles `screenshot_request` SSE by capturing current project HTML with `@zumer/snapdom` in an offscreen no-script iframe and posting a correlated screenshot response; client still never writes HTML.
  - `apps/server/AGENTS.md`: `/agent` accepts optional image attachments; OpenRouter is used for OCR/vision parsing; add `POST /api/screenshot-responses/:requestId`; process-local pending screenshot responses are runtime state like image store.
  - `apps/server/src/mastra/AGENTS.md`: tools include `screenshot`; tool additions update SSE mapping, cost accounting, client event types; `design-skill` and edit constraints remain anchored to `/index.html`; screenshot tool observes preview and returns text, it does not edit files.
- Focused verification commands for implementation and final verification:
  - Root dependency check after adding SnapDOM: `pnpm install --lockfile-only` or equivalent pnpm lock refresh, then inspect `pnpm-lock.yaml` for `@zumer/snapdom`.
  - Client: `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, `pnpm --filter @workspace/client build`; `pnpm --filter @workspace/client test` is expected to exit 1 until client tests exist, so record the exact result if unchanged.
  - Server: `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/server lint`, `pnpm --filter @workspace/server test`, `pnpm --filter @workspace/server build`.
  - Focused tests during implementation: new server tests for image OCR data URL handling, screenshot registry/tool behavior, and project message attachment persistence.
- Implementation commit convention must be determined from `git log --oneline -20` before writing `implementation.md`; each completed implementation todo needs its own commit tagged `[image-recognition-ocr][phase-N][todo-slug]`.

### Gotchas
- Current worktree already has unrelated modified client/server files from prior work, including files this feature will touch (`composer.tsx`, `prompt-panel.tsx`, `landing-tools.ts`, and AGENTS files). Before implementation commits, either those changes need to be committed/staged intentionally, or implementation commits must use precise hunk staging to avoid mixing unrelated work.