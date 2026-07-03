# Implementation — html-anchor-edit

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
- `[phase-name]` — the task slug (this folder's `html-anchor-edit`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Add Anchored Document Core

### Description
Implement the pure anchored HTML document module and tests.

Files: `apps/server/src/mastra/lib/html-anchor-document.ts`, `apps/server/src/mastra/lib/html-anchor-document.test.ts`.

Acceptance criteria: parsing/rendering preserves LF/CRLF and final newline intent; duplicate/blank HTML lines have distinct anchors; compact `anchor|text` output works; find returns contextual anchored lines; range edits are atomic, stable for untouched anchors, fresh for inserted/replaced lines, and reject missing/overlapping/stale ranges.

### Todo
- [x] Implement anchored document core and focused unit tests.

### Results
Implemented `apps/server/src/mastra/lib/html-anchor-document.ts` with the v1 `html.json` schema, stable opaque line anchors, render/parse/checksum helpers, compact `anchor|text` read/find output, and atomic operation/range edit application.

Added `apps/server/src/mastra/lib/html-anchor-document.test.ts` covering LF/CRLF rendering, duplicate/blank line anchors, compact reads, literal/regex find, anchor-preserving batches, whole-document `range: []` replacement, missing/overlapping/no-op edit failures, and checksum/duplicate-anchor validation.

Checks passed from repo root:

- `pnpm --filter @workspace/server test -- html-anchor-document.test.ts`
- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server format:check`

### Gotchas
- New documents intentionally use opaque monotonic anchors (`a1`, `a2`, ...); repeated lines and blank lines therefore remain independently addressable.

## Phase 2: Convert In-Memory HTML Store

### Description
Make the in-memory `HtmlStore` use anchored documents while preserving string `get()`/`set()` compatibility.

Files: `apps/server/src/mastra/lib/html-store.ts` and relevant existing tests.

Acceptance criteria: `createHtmlStore()` exposes document get/set methods, `get()` renders current document HTML, `set()` replaces the whole document, and existing store consumers still compile.

### Todo
- [x] Convert in-memory store to anchored document storage and verify focused tests.

### Results
Converted `apps/server/src/mastra/lib/html-store.ts` so `createHtmlStore()` stores an anchored document internally while keeping `get()`, `set()`, and `reset()` string-compatible. Added `getDocument()` and `setDocument()` to the `HtmlStore` contract with defensive cloning.

Added `apps/server/src/mastra/lib/html-store.test.ts` covering rendered HTML compatibility, defensive document cloning, document-based edits, reset, and whole-document string replacement.

Updated `createProjectHtmlStore()` to satisfy the expanded `HtmlStore` interface for compile compatibility; full `html.json` persistence remains Phase 3.

Checks passed from repo root:

- `pnpm --filter @workspace/server test -- html-store.test.ts edit.test.ts html-anchor-document.test.ts`
- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server format:check`

### Gotchas
- The file-backed project store still persists through legacy `index.html` in this phase; Phase 3 replaces that with `html.json` only.

## Phase 3: Migrate Project Storage to html.json

### Description
Move file-backed project HTML persistence to `html.json` only, with legacy `index.html` import when no `html.json` exists.

Files: `apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/mastra/lib/project-store.test.ts`.

Acceptance criteria: new projects write `html.json` and do not create `index.html`; `getProject()` renders `indexHtml` from `html.json`; legacy `index.html` is migrated when `html.json` is absent; sync write-through remains race-free; image URL normalization still persists project images.

### Todo
- [x] Persist project HTML through html.json only and verify migration tests.

### Results
Updated `apps/server/src/mastra/lib/project-store.ts` so new projects write only `html.json`, `getProject()` renders `indexHtml` from `html.json`, and `createProjectHtmlStore()` reads/writes the anchored document synchronously. Legacy `index.html` is imported only when `html.json` is absent, then removed.

Expanded `apps/server/src/mastra/lib/project-store.test.ts` to verify new project `html.json` creation, absence of `index.html`, legacy `index.html` migration/removal, and write-through store edits persisted to `html.json` only.

Checks passed from repo root:

- `pnpm --filter @workspace/server test -- project-store.test.ts html-store.test.ts html-anchor-document.test.ts`
- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server format:check`

### Gotchas
- `project.indexHtml` remains a rendered API field for client compatibility; it is no longer backed by a persisted `index.html` file.

## Phase 4: Add Anchored Read/Find Tools

### Description
Switch read output to compact anchors and replace the public `grep` tool with anchored `find`.

Files: `apps/server/src/mastra/tools/read.ts`, `apps/server/src/mastra/tools/find.ts`, `apps/server/src/mastra/tools/landing-tools.ts`, `apps/server/src/mastra/agents/landing-page-agent.ts`, `apps/server/src/mastra/route.ts`, and tool/route tests.

Acceptance criteria: public tools include `read`, `find`, and `edit`; `read`/`find` return compact `anchor|text`; route summaries and retry gating recognize `find`; full `html_update` behavior remains unchanged.

### Todo
- [ ] Integrate anchored read/find tools and verify focused tests.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 5: Switch Edit Tool to Anchor Ranges

### Description
Replace `oldText`/`newText` public editing with operation/range batches over anchored documents.

Files: `apps/server/src/mastra/tools/edit.ts`, `apps/server/src/mastra/tools/edit.test.ts`, `apps/server/src/mastra/route.test.ts`, plus shared helpers as needed.

Acceptance criteria: `edit` accepts `{ operation, range, text }` batches, resolves all ranges against the original document, applies atomically, returns concise metadata without full HTML, and successful changes still trigger `html_update`.

### Todo
- [ ] Integrate anchor-range edit tool and verify focused tests.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 6: Update Contracts and Run Focused Checks

### Description
Update DOX docs for the new `html.json` source of truth and run focused server checks.

Files: `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`, `.phases/phase-html-anchor-edit/implementation.md`.

Acceptance criteria: docs no longer describe `index.html` as the editable source of truth, tool contracts mention anchored read/find/edit behavior, and focused server test/typecheck/lint results are recorded.

### Todo
- [ ] Update server DOX contracts and run focused server verification.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
