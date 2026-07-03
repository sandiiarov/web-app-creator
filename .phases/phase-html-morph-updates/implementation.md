# Implementation — html-morph-updates

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
- `[phase-name]` — the task slug (this folder's `html-morph-updates`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Server html_update stream event

### Description
Add route-local HTML hashing/payload helpers and emit `html_update` after successful content-changing edit tool results. Work only in `apps/server/src/mastra/route.ts` and `apps/server/src/mastra/route.test.ts`. Preserve existing edit failure guards and do not persist HTML into message turns.

### Todo
- [x] Add `html_update` route emission plus focused route tests for edit emission and failed/no-op suppression.

### Results
- Added route-local SHA-256/byte-count helpers and `html_update` SSE emission after successful `edit` tool results when `store.get()` differs from the last sent project HTML.
- Added route tests proving changed edits emit `html_update` after the edit `tool_call` row, failed edits emit no update, and successful unchanged edits emit no update.
- Checks run:
  - `pnpm --filter @workspace/server exec oxfmt -c oxfmt.config.ts --check src/mastra/route.ts src/mastra/route.test.ts` — passed.
  - `pnpm --filter @workspace/server exec oxlint src/mastra/route.ts src/mastra/route.test.ts` — passed.
  - `pnpm --filter @workspace/server exec vitest run --config vitest.config.ts src/mastra/route.test.ts` — passed (1 file, 10 tests).
  - `pnpm --filter @workspace/server typecheck` — passed.

### Gotchas
- The current worktree already has uncommitted screenshot-related edits in `route.ts`; stage morph hunks precisely.

## Phase 2: Client html_update event consumption

### Description
Add the client event type and route `html_update` through `useLandingPage` so normal edit completion no longer fetches the full project. Work in `apps/client/src/lib/landing-agent.ts` and `apps/client/src/hooks/use-landing-page.ts` only for this slice; screenshot requests must keep their independent latest-project fetch.

### Todo
- [x] Add `HtmlUpdateEvent` and update `useLandingPage` to consume it while removing the edit-done refresh.

### Results
- Added `HtmlUpdateEvent` to the client SSE event model.
- Updated `useLandingPage` to apply same-project `html_update` payloads via `expandProjectImageUrls(update.html)` and `setHtml(...)`.
- Removed the normal `refreshHtml()` call from edit-done `tool_call` handling; edit-done now only increments `htmlSwaps` and relies on `html_update` for preview HTML state.
- Checks run:
  - `pnpm --filter @workspace/client exec oxfmt -c oxfmt.config.ts --check src/lib/landing-agent.ts src/hooks/use-landing-page.ts` — passed.
  - `pnpm --filter @workspace/client exec oxlint src/lib/landing-agent.ts src/hooks/use-landing-page.ts` — passed.
  - `pnpm --filter @workspace/client typecheck` — passed.
  - `pnpm --filter @workspace/client test` — passed (2 files, 7 tests).

### Gotchas
- This slice updates React HTML state but Phase 3 is required before iframe updates avoid `srcDoc` reloads in the UI.

## Phase 3: Idiomorph preview morphing

### Description
Add Idiomorph to the client and make the preview iframe morph routine HTML prop changes in place. Work in `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/client/package.json`, `apps/client/src/types/idiomorph.d.ts`, `apps/client/src/lib/preview-morph.ts`, `apps/client/src/components/landing-preview.tsx`, and `apps/client/src/components/landing-preview.test.ts`.

### Todo
- [x] Add Idiomorph to the catalog, client package, lockfile, and local type declarations.
- [x] Add preview morph helpers and string-only tests for base preservation and script-change reload detection.
- [x] Update `LandingPreview` to keep stable `srcDoc` state and apply routine updates with Idiomorph.

### Results
- Added `idiomorph` to the root catalog, `@workspace/client` dependencies, and `pnpm-lock.yaml`.
- Added `apps/client/src/types/idiomorph.d.ts` for the named `Idiomorph` ESM export used by the client.
- Checks run:
  - `pnpm install --lockfile-only` — passed.
  - `pnpm install` — passed.
  - `pnpm --filter @workspace/client typecheck` — passed.
- Added `apps/client/src/lib/preview-morph.ts` with `preparePreviewMorphHtml`, `morphPreviewDocument`, and script-signature reload helpers.
- Extended `landing-preview.test.ts` with base-tag preservation and script-change detection tests.
- Additional checks run:
  - `pnpm --filter @workspace/client exec oxfmt -c oxfmt.config.ts src/lib/preview-morph.ts src/components/landing-preview.test.ts` — fixed formatting.
  - `pnpm --filter @workspace/client exec oxfmt -c oxfmt.config.ts --check src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed.
  - `pnpm --filter @workspace/client exec oxlint src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed.
  - `pnpm --filter @workspace/client test` — passed (2 files, 9 tests).
  - `pnpm --filter @workspace/client typecheck` — passed.
- Updated `LandingPreview` to keep local `srcDoc` state for initial load/fallback reloads while routine `html` prop changes morph `iframe.contentDocument.documentElement` with Idiomorph.
- Preserved empty-state rendering, the existing sandbox flags, and script-change fallback reload behavior.
- Final Phase 3 checks run:
  - `pnpm --filter @workspace/client exec oxfmt -c oxfmt.config.ts --check src/components/landing-preview.tsx src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed.
  - `pnpm --filter @workspace/client exec oxlint src/components/landing-preview.tsx src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed.
  - `pnpm --filter @workspace/client test` — passed (2 files, 9 tests).
  - `pnpm --filter @workspace/client typecheck` — passed.
  - `pnpm --filter @workspace/client build` — passed with the existing Node `DEP0205` and Vite chunk-size warnings.

### Gotchas
- If React renders the raw `html` prop into `srcDoc`, the iframe will still reload. The component must render stable local `srcDoc` state.
- Script changes should fall back to reload for correctness rather than silently leaving stale iframe runtime behavior.

## Phase 4: DOX and implementation closeout

### Description
Update durable contracts after behavior changes and run focused verification before moving to `verification.md`. Work in `apps/client/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`, and this phase file.

### Todo
- [ ] Update client/server/Mastra DOX for `html_update` and morph preview behavior.
- [ ] Run focused client/server checks and record results in this file.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
