# Plan — html-morph-updates

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

## Phase 1: Resolve morph strategy and payload contract

### Description
Files touched: `.phases/phase-html-morph-updates/plan.md` only. Approach: convert research into the implementation decision before editing app code. Acceptance criteria: the plan states whether server-side patch instructions are in scope, which DOM morph library will be used, what event payload crosses the SSE boundary, and how correctness/fallbacks work.

### Todo
- [x] Decide between morphdom, Idiomorph, and custom serialized server patch instructions.
- [x] Define the server/client SSE payload at a level precise enough to implement and test.
- [x] Define normal morph behavior and fallback reload behavior.

### Results
- Use **Idiomorph** on the client. Research shows it is better aligned than morphdom for whole-page preview morphing because it documents full-page morphing, head merging, focus restoration, active-element options, and id-set matching for nested/leaf ids.
- Do **not** build server-side morphdom/Idiomorph patch instructions in this slice. Neither library documents a serialized patch protocol; both are designed to mutate a live DOM. The browser iframe owns the live DOM state, so the server will compare raw previous/new HTML strings and emit a target-HTML update while the client computes/applies DOM operations.
- Add a new custom SSE event named `html_update` rather than overloading the existing `tool_call` event or introducing a misleading `html` event. Payload shape: `{ projectId: string; sequence: number; previousHash: string; hash: string; bytes: number; html: string }`.
- The `html` field carries the server-owned persisted `index.html` target. The client expands project image URLs and injects the preview-only `<base href="about:srcdoc">` before morphing; it never writes HTML back to the server.
- Normal path: successful `edit` tool result mutates the project store, `streamLandingAgent` compares the last sent server HTML with `store.get()`, then sends `html_update` only if content changed. The client applies it to the existing iframe document with Idiomorph, avoiding a React `srcDoc` replacement.
- Fallback path: initial project load, project switch, empty preview, inaccessible iframe document, morph failure, or script-signature changes may use `srcDoc` replacement for correctness. Routine edit updates should use morphing.

### Gotchas
- Inline/generated scripts are a correctness edge case. Morphing DOM nodes does not guarantee a changed script executes like a fresh page load. The implementation should detect meaningful script changes and reload only for that case rather than silently leaving stale behavior.
- The update payload includes full target HTML, not a compact operation list. This avoids inventing an unverified patch protocol and keeps server-owned HTML as the source of truth.

## Phase 2: Server emits `html_update` after successful edits

### Description
Files touched: `apps/server/src/mastra/route.ts`, `apps/server/src/mastra/route.test.ts`. Approach: maintain the last server HTML seen during a run, hash previous/next strings, and emit `html_update` immediately after a successful `edit` tool result when the project HTML changed. Acceptance criteria: route tests prove a fake edit mutation produces `tool_call` done plus `html_update` with project id, sequence, hashes, byte count, and new HTML; no event is sent for failed/non-edit tool results.

### Todo
- [x] Specify server helper and state placement.
- [x] Specify stream ordering and no-op behavior.
- [x] Specify focused server test coverage.

### Results
- In `streamLandingAgent`, initialize `lastHtmlUpdate = store.get()` after creating `createProjectHtmlStore(projectId)` and before the stream loop.
- Add small route-local helpers such as `hashHtml(html: string)` and `createHtmlUpdatePayload({ projectId, sequence, previousHtml, html })` using Node crypto SHA-256 and `Buffer.byteLength(html, 'utf8')`.
- On a non-error `tool-result` where `toolName === 'edit'`, after recording/sending the terminal `tool_call` event and incrementing `recordedTurn.htmlSwaps`, call `store.get()`, compare it to `lastHtmlUpdate`, and send `html_update` if different. Then update `lastHtmlUpdate` and increment sequence.
- Preserve existing edit failure guards, read/grep reset behavior, stats/cost accumulation, and message persistence. Do not persist HTML payloads into `messages.json`; `htmlSwaps` remains the saved summary counter.
- Add a `route.test.ts` case that mocks `createLandingPageAgent`, captures the injected `store`, calls `store.set('<!doctype html>...')` from a fake edit stream before yielding the edit `tool-result`, and asserts the SSE frames include `html_update` after the edit tool row.
- Add/extend a route test for failed edit or non-edit tool result if needed to prove no `html_update` event leaks on failures.

### Gotchas
- Current route tests mock the agent stream, so the fake stream must mutate the passed `HtmlStore`; yielding an edit result alone will not change persisted HTML.
- The worktree already has uncommitted route/screenshot changes. Implementation commits must stage only morph-related hunks unless those pre-existing changes are intentionally committed first.

## Phase 3: Client consumes `html_update` without edit-done project fetches

### Description
Files touched: `apps/client/src/lib/landing-agent.ts`, `apps/client/src/hooks/use-landing-page.ts`, optionally `apps/client/src/lib/projects-api.ts`. Approach: add the event type, route `html_update` through the SSE switch, update the local rendering copy of HTML from the event, and stop the normal edit-done path from pulling the full project. Acceptance criteria: an edit-done tool row still increments the turn's `htmlSwaps`, the HTML state updates from `html_update`, screenshot capture still pulls latest server HTML independently, and `GET /api/projects/:id` remains only for initial load/fallback/screenshot.

### Todo
- [x] Specify client event type changes.
- [x] Specify hook behavior changes and fallback stance.
- [x] Specify focused checks.

### Results
- Add `HtmlUpdateEvent` to `apps/client/src/lib/landing-agent.ts` with the server payload fields: `projectId`, `sequence`, `previousHash`, `hash`, `bytes`, and `html`.
- In `useLandingPage`, handle `event === 'html_update'`: ignore mismatched `projectId`, expand project image URLs with `expandProjectImageUrls(payload.html)`, then call `setHtml(...)`.
- Change the `tool_call` edit-done branch to increment `htmlSwaps` only; remove the routine `refreshHtml()` call from that branch so a successful edit does not cause a full project fetch and iframe `srcDoc` replacement.
- Keep `refreshHtml()` available for initial-load style fallbacks if implementation reveals an event-missing edge case, but do not use it in the normal edit path.
- Keep screenshot handling unchanged in principle: `screenshot_request` should still call `getProject(event.projectId)` and capture the latest server HTML in its temporary offscreen iframe. This intentionally remains separate from the live preview morph path.
- Focused checks: `pnpm --filter @workspace/client typecheck` and `pnpm --filter @workspace/client test` after the client event model compiles.

### Gotchas
- Updating React `html` state alone would still reload the iframe until `LandingPreview` is changed. This phase is coupled to Phase 4 for user-visible no-refresh behavior.
- Client image URL expansion must happen before morphing; stored project HTML may contain root-relative `/api/projects/:id/images/...` URLs.

## Phase 4: Apply updates inside the iframe with Idiomorph

### Description
Files touched: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/client/package.json`, `apps/client/src/types/idiomorph.d.ts` (new), `apps/client/src/lib/preview-morph.ts` (new), `apps/client/src/components/landing-preview.tsx`, `apps/client/src/components/landing-preview.test.ts`. Approach: add Idiomorph as a client dependency with a local type declaration, isolate morph helpers in `src/lib/preview-morph.ts`, and make `LandingPreview` own its `srcDoc` state so prop changes morph the existing same-origin iframe document instead of replacing it. Acceptance criteria: initial load/project switch still renders via `srcDoc`, routine `html` prop changes call Idiomorph against `iframe.contentDocument.documentElement`, unchanged HTML is ignored, and fallback reload occurs only for empty/inaccessible/morph-failed/script-changed cases.

### Todo
- [x] Specify dependency/catalog updates.
- [x] Specify typed wrapper/declaration for Idiomorph.
- [x] Specify preview component state and morph helper behavior.
- [x] Specify client tests and build checks.

### Results
- Add `idiomorph: ^0.7.4` to the root catalog and `"idiomorph": "catalog:"` to `@workspace/client` dependencies; refresh `pnpm-lock.yaml` with pnpm.
- Add a minimal local declaration for `idiomorph` because no `@types/idiomorph` package exists. The declaration only needs the exported `Idiomorph.morph(existingNode, newNodeOrHtmlString, options)` surface used by the app plus the relevant option unions.
- Add `apps/client/src/lib/preview-morph.ts` with pure helpers:
  - `preparePreviewMorphHtml(html)` delegates to `preparePreviewSrcDoc(html)` so morph targets include the client-only base tag.
  - `getScriptSignature(html)`/`shouldReloadForScriptChange(previousHtml, nextHtml)` provide a conservative reload decision when executable script content or `src` values change.
  - `morphPreviewDocument(doc, html)` calls `Idiomorph.morph(doc.documentElement, preparePreviewMorphHtml(html), { head: { style: 'morph' }, restoreFocus: true })`.
- Update `LandingPreview` to keep `srcDoc` in local state instead of directly rendering `srcDoc={preparePreviewSrcDoc(html)}` on every prop change. Track the last applied HTML in a ref. When `html` changes:
  - empty HTML clears the preview and renders `LandingEmptyState`;
  - first non-empty HTML sets `srcDoc` for initial load;
  - later changed HTML attempts `morphPreviewDocument(iframe.contentDocument, html)`;
  - if the iframe document is not ready, morph throws, or script signatures changed, set `srcDoc` to the prepared target as a correctness fallback.
- Keep the existing sandbox, including `allow-same-origin` and `allow-scripts`, because same-origin access is required for in-frame morphing and the user explicitly requested it.
- Extend `landing-preview.test.ts` with string-only tests for script-signature/reload helpers and base-tag preservation. DOM morph execution itself will be covered by typecheck/build and optional browser QA because the shared Vitest environment is Node.
- Focused checks: `pnpm --filter @workspace/client test`, `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, and `pnpm --filter @workspace/client build`.

### Gotchas
- If React keeps writing a changing `srcDoc` prop, the iframe will still reload. The implementation must render the stable local `srcDoc` state, not the raw `html` prop.
- `Idiomorph.morph(document.documentElement, fullHtmlString, ...)` is documented, but the exact import shape is untyped. The local declaration and typecheck are required integration guardrails.

## Phase 5: DOX, implementation phase files, and verification plan

### Description
Files touched: `.phases/phase-html-morph-updates/implementation.md`, `.phases/phase-html-morph-updates/verification.md`, `apps/client/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`. Approach: update phase files for execution, then update durable contracts after code changes alter the SSE/preview behavior. Acceptance criteria: implementation.md has ordered sub-phases matching this plan with one commit per todo, DOX no longer claims there is no HTML update push, and verification.md lists actual commands/results after implementation.

### Todo
- [x] Specify implementation sub-phases and commit convention.
- [x] Specify DOX changes.
- [x] Specify verification commands.

### Results
- `implementation.md` should mirror this plan as small slices and use commit tags like `[html-morph-updates][phase-N][todo-slug]`, following existing Conventional Commit-style subjects from `git log --oneline -20`.
- Required DOX updates after implementation:
  - `apps/client/AGENTS.md`: streamed events now include `html_update`; normal edit preview updates morph the live iframe with Idiomorph instead of fetching the full project and replacing `srcDoc`; initial load/screenshot/fallback fetch paths remain server-owned.
  - `apps/server/AGENTS.md`: `/agent` streams `html_update` after successful content-changing edits; clients should not use it as a save path; project REST remains the canonical read path.
  - `apps/server/src/mastra/AGENTS.md`: `route.ts` emits `html_update` from the write-through store after successful edits; no HTML payload is persisted in message turns.
- Verification commands to run/record:
  - `pnpm install --lockfile-only` when adding Idiomorph, then inspect relevant lock/catalog diffs.
  - `pnpm --filter @workspace/server test`
  - `pnpm --filter @workspace/server typecheck`
  - `pnpm --filter @workspace/server lint`
  - `pnpm --filter @workspace/server build`
  - `pnpm --filter @workspace/client test`
  - `pnpm --filter @workspace/client typecheck`
  - `pnpm --filter @workspace/client lint`
  - `pnpm --filter @workspace/client build`
  - `pnpm --filter @workspace/client format:check`
  - `pnpm --filter @workspace/server format:check`
  - `git diff --check`
- Final verification should inspect for debug logs, accidental base-tag persistence, client HTML write paths, stale DOX text claiming no HTML push/update event, and accidental staging of the pre-existing screenshot-route worktree changes.

### Gotchas
- The current worktree is not clean and includes uncommitted screenshot-related edits in files this feature will also touch (`use-landing-page.ts`, `landing-agent.ts`, `route.ts`). Implementation commits must either preserve those hunks unstaged or intentionally coordinate with the user before mixing them into morph commits.
