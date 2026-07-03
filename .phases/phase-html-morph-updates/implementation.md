# Implementation — html-morph-updates

Status: Complete
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
- [x] Update client/server/Mastra DOX for `html_update` and morph preview behavior.
- [x] Run focused client/server checks and record results in this file.

### Results
- Updated `apps/client/AGENTS.md` for `html_update`, live Idiomorph preview morphing, and continued server-owned HTML/no client PUT behavior.
- Updated `apps/server/AGENTS.md` for the `html_update` SSE payload and canonical project REST read path.
- Updated `apps/server/src/mastra/AGENTS.md` for route-level `html_update` emission from the write-through store and non-persistence of HTML payloads in message turns.
- Stale contract search: `grep` for old no-HTML/pull-after-edit wording in `**/AGENTS.md` found no matches.
- Focused verification initially found `perfectionist(sort-modules)` errors in `apps/client/src/types/idiomorph.d.ts`; reordered declarations and reran checks.
- Checks run:
  - `pnpm --filter @workspace/client format:check` — passed.
  - `pnpm --filter @workspace/client lint` — passed with existing `react-refresh(only-export-components)` warning in `src/main.tsx` and Node `DEP0205` warning.
  - `pnpm --filter @workspace/client test` — passed (2 files, 9 tests).
  - `pnpm --filter @workspace/client typecheck` — passed.
  - `pnpm --filter @workspace/client build` — passed with existing Node `DEP0205` and Vite chunk-size warnings.
  - `pnpm --filter @workspace/server format:check` — passed.
  - `pnpm --filter @workspace/server lint` — passed.
  - `pnpm --filter @workspace/server test` — passed (11 files, 61 tests).
  - `pnpm --filter @workspace/server typecheck` — passed.
  - `pnpm --filter @workspace/server build` — passed.
  - `git diff --check` — passed.

### Gotchas
- Existing client lint/build warnings remain: React Refresh warning in `src/main.tsx`, Node `DEP0205`, and Vite chunk-size warning.

## Phase 5: Prevent live iframe reloads during morph updates

### Description
A browser E2E mock reproduced that the first `html_update` still replaced iframe `srcDoc` for a markup-only edit. Fix the client preview so existing iframe documents wait/morph instead of falling back to `setSrcDoc` while loading, and handle script changes by re-running scripts after a morph rather than forcing a full frame refresh.

### Todo
- [x] Patch preview morph/reload logic and tests so routine updates do not replace `srcDoc`.
- [x] Run browser E2E against mocked `html_update` and focused client checks.

### Results
- Reproduced the user's report with a real Vite client + mock SSE server: after a markup-only `html_update`, the old implementation produced `loads: 1`, `sameDoc: false`, and `srcdocHasMorphed: true`, proving it replaced the iframe `srcDoc`.
- Root cause: the direct Idiomorph call ran in the parent React app realm against iframe DOM nodes. A direct browser probe threw `TypeError: newContent is not iterable` from Idiomorph's `normalizeParent`, consistent with cross-realm `instanceof Node` checks failing for same-origin iframe nodes. `LandingPreview` caught that error and fell back to `setSrcDoc(...)`.
- Replaced the direct Idiomorph integration with a small same-document DOM morph helper in `apps/client/src/lib/preview-morph.ts` that parses target HTML using the iframe document, matches same-tag/id siblings, syncs attributes, morphs children/text nodes, and avoids cross-realm `instanceof` checks.
- Updated `LandingPreview` so existing iframe documents wait for readiness and morph in place instead of reloading while `doc.readyState === 'loading'`.
- Script-changing updates now morph in place and rerun scripts inside the existing iframe document; the old script-change full-refresh guard was removed.
- Removed the now-unused `idiomorph` client dependency, catalog entry, lockfile entries, and local type declaration.
- Browser E2E after the fix, markup-only update: `h1: "Morphed hero"`, `loads: 0`, `sameDoc: true`, `sentinel: "keep"`, `srcdocHasInitial: true`, `srcdocHasMorphed: false`.
- Browser E2E after the fix, script-changing update: `h1: "Script changed hero"`, `boots: 2`, `scriptVersion: 2`, `loads: 0`, `sameDoc: true`, `sentinel: "keep-script"`, `srcdocHasScriptChanged: false`.
- Focused checks run:
  - `pnpm --filter @workspace/client exec oxfmt -c oxfmt.config.ts src/components/landing-preview.tsx src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed.
  - `pnpm --filter @workspace/client exec oxlint src/components/landing-preview.tsx src/lib/preview-morph.ts src/components/landing-preview.test.ts` — passed after helper-order cleanup.
  - `pnpm --filter @workspace/client test` — passed (2 files, 9 tests).
  - `pnpm --filter @workspace/client typecheck` — passed after replacing `Node.replaceWith` with `parentNode.replaceChild`.
  - `pnpm --filter @workspace/client format:check` — passed.
  - `pnpm --filter @workspace/client lint` — passed with existing `react-refresh(only-export-components)` and Node `DEP0205` warnings.
  - `pnpm --filter @workspace/client build` — passed with existing Node `DEP0205` and Vite chunk-size warnings.
  - `git diff --check` — passed.

### Gotchas
- Browser E2E is required for this behavior; unit/type/build checks missed the iframe reload because the failure came from browser iframe realms and the fallback path still rendered correctly.
- Direct DOM morph libraries can be unsafe across iframe realms if they use parent-window `instanceof Node`/`Element` checks against iframe nodes.
