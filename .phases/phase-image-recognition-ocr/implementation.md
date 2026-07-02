# Implementation — image-recognition-ocr

Status: In Progress
Prerequisite: plan.md `Status: Complete`

> **Purpose:** execute the plan one slice at a time. Small increments, commit each todo, run checks after each sub-phase.

## Guidance

- **One sub-phase = one slice from the plan.** Work them in order. Don't jump ahead.
- **Implement the smallest amount** that satisfies the slice. No speculative abstractions, no polish on unrelated code.
- **Run the checks** discovered in research after each sub-phase, not just at the end.
- **Stay in scope.** If a sub-phase reveals more work than planned, record it and return to planning — don't silently expand the slice.

## Commit rule — one commit per todo item

When a todo is genuinely done (file saved, test passing), commit it on its own:

```
<repo-convention-subject> [phase-name][phase-N][todo-item-slug]
```

- `<repo-convention-subject>` — follow the repo's existing convention. Inspect `git log --oneline -20` and any `.gitmessage` / Conventional Commits config; fall back to a plain descriptive imperative subject if none is detectable.
- `[phase-name]` — the task slug (this folder's `[name]`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: SnapDOM dependency and shared vision foundation

### Description
Add the SnapDOM client dependency and extend the existing OpenRouter vision helper so both URL OCR and data-url OCR use the same `z-ai/glm-5v-turbo` path. This slice should be checkable without UI or agent route changes.

### Todo
- [x] Add `@zumer/snapdom` to the workspace catalog, client package, and lockfile.
- [x] Extend `image-ocr.ts` to accept validated data-url image inputs while preserving existing `ocrImages(urls)` behavior.
- [x] Add focused server tests for image data-url normalization, unsupported media, missing API key, and OpenRouter payload shape.

### Results
- Added `@zumer/snapdom` to the root catalog, client dependency list, and lockfile.
- Extended `apps/server/src/mastra/lib/image-ocr.ts` with `ocrImageInputs()` for URL and data-url images while preserving `ocrImages(urls)` as a URL wrapper.
- Added `apps/server/src/mastra/lib/image-ocr.test.ts` covering missing OpenRouter key behavior, unsupported data URL media types, data URL deduplication/OpenRouter payload shape, and URL fetch behavior.
- Checks run:
  - `pnpm --filter @workspace/client typecheck` — passed.
  - `pnpm --filter @workspace/server exec oxfmt -c oxfmt.config.ts src/mastra/lib/image-ocr.ts src/mastra/lib/image-ocr.test.ts` — passed.
  - `pnpm --filter @workspace/server exec oxlint src/mastra/lib/image-ocr.ts src/mastra/lib/image-ocr.test.ts` — passed.
  - `pnpm --filter @workspace/server typecheck` — passed.
  - `pnpm --filter @workspace/server exec vitest run --config vitest.config.ts src/mastra/lib/image-ocr.test.ts` — passed (4 tests).

### Gotchas
- `image-ocr.ts` imports runtime config at module load, so tests dynamically import it after stubbing `BASETEN_API_KEY` and `OPENROUTER_API_KEY`.

## Phase 2: User image attachments end-to-end

### Description
Add image attachment UI in the prompt composer, carry attachment inputs through `useLandingPage` to `/agent`, parse attachments before the agent run, inject transcript context into the agent prompt, and persist/render attachment metadata.

### Todo
- [x] Add client attachment types, composer attach button/chips, file validation, and send payload wiring.
- [x] Extend `/agent` request validation, project message attachment metadata, and route pre-run attachment OCR/tool events.
- [ ] Add/adjust server tests for attachment persistence and pre-run OCR prompt/tool metadata.
- [ ] Run focused client and server checks for the attachment slice.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Screenshot request/response bridge and tool

### Description
Add a process-local pending screenshot registry, `POST /api/screenshot-responses/:requestId`, a Mastra `screenshot` tool, and client handling of `screenshot_request` events using SnapDOM capture in an offscreen no-script iframe.

### Todo
- [ ] Add server screenshot registry, response endpoint, and tests for resolve/error/timeout behavior.
- [ ] Add `screenshot` Mastra tool, register it, emit `screenshot_request` SSE, OCR returned screenshots, and update tool summaries/cost accounting.
- [ ] Add client screenshot capture helper with `@zumer/snapdom`, handle `screenshot_request`, and post correlated responses.
- [ ] Add/adjust focused tests where practical and run focused client/server checks for the screenshot slice.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 4: DOX pass and final focused verification

### Description
Update durable app/server/Mastra contracts for attachments, OpenRouter vision OCR, screenshot request/response transport, SnapDOM capture, and process-local runtime state; then run final focused verification.

### Todo
- [ ] Update nearest owning AGENTS docs for client, server, and Mastra behavior changes.
- [ ] Run final focused format/lint/typecheck/test/build checks and record exact results.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
