# Plan — html-anchor-edit

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

## Phase 1: Resolve Contract Decisions

### Description
Design-only phase. No source files are touched during planning. Resolve research open questions using the user's stated preferences: one HTML content source, `html.json` as source of truth, compact anchored read/find output, and an `edit` API based on `operation`, `range`, and `text`.

Acceptance criteria: every research open question has an implementation decision that can be mapped to file-level work.

### Todo
- [x] Decide source-of-truth relationship between `html.json` and `index.html`.
- [x] Decide whether SSE/REST client contracts change in this task.
- [x] Decide anchor identity and stale-edit behavior.
- [x] Decide whether tool output fully switches from raw text to anchored compact text.
- [x] Decide final edit operation/range direction.

### Results
- Persisted source of truth will become `apps/server/src/mastra/.data/projects/<id>/html.json`. Do not keep or generate `index.html` as a mirror/export artifact; render HTML on demand from `html.json` for REST, SSE, preview, and export surfaces. This satisfies the single-source constraint without a second HTML file.
- Existing REST and SSE preview contracts stay stable for this task: `GET /api/projects/:id` still returns `project.indexHtml` as a rendered HTML string, and `html_update` still streams the full rendered `html`. The token-saving work is scoped to agent tool I/O first.
- Anchors will be stable opaque IDs generated from a monotonic per-document counter, e.g. `a1`, `a2`, `a3` using base36. Untouched lines keep anchors; inserted/replaced lines get fresh anchors; deleted/replaced anchors disappear. Missing anchors reject stale edits atomically.
- `read` and public search will return compact normalized `anchor|text` lines rather than raw JSON or line-numbered text. The public search tool should be named `find`; old `grep` implementation can be reused internally only if helpful.
- `edit` will switch to batch operations using structured tuple ranges:
  - `range: [anchor]` targets one line.
  - `range: [startAnchor, endAnchor]` targets an inclusive range.
  - `range: []` means whole-document replacement for `replace`, document start for `insert_before`, and document end for `insert_after`; it is invalid for `delete`.
  - Supported operations: `replace`, `delete`, `insert_before`, `insert_after`.

### Gotchas
- Keeping full `html_update.html` means network payload size remains unchanged; this is intentional to avoid coupling the first anchored-tool implementation to client preview diffing.
- Do not write a generated `index.html` mirror. Migration should read legacy `index.html` only when `html.json` is absent, convert it to `html.json`, and then leave `html.json` as the only ongoing HTML content file.

## Phase 2: Plan the Anchored Document Module

### Description
Files to add/touch during implementation: `apps/server/src/mastra/lib/html-anchor-document.ts` and `apps/server/src/mastra/lib/html-anchor-document.test.ts`; optionally reuse `apps/server/src/mastra/lib/edit-diff.ts` exports for diff/patch display.

Approach: create a pure TypeScript module that owns schema validation, HTML rendering/parsing, anchor generation, compact line formatting, find, and atomic line-edit application. Keep it independent from Mastra tools and file storage so it can be heavily unit-tested.

Acceptance criteria: unit tests prove duplicate HTML lines are safe, untouched anchors stay stable, replaced lines get fresh anchors, batches are atomic, invalid/missing/overlapping ranges fail, rendered HTML matches expected strings, and compact output is `anchor|text`.

### Todo
- [x] Define the `html.json` schema.
- [x] Define parse/render behavior for line endings and trailing newlines.
- [x] Define read/find compact output behavior.
- [x] Define atomic edit validation/application behavior.
- [x] Define reusable diff/checksum behavior.

### Results
Implementation schema:

```ts
export interface HtmlDocumentJsonV1 {
  checksum: `sha256:${string}`
  finalNewline: boolean
  lineEnding: '\n' | '\r\n'
  lines: Array<[anchor: string, text: string]>
  nextAnchor: number
  version: 1
}
```

Core behavior:

- Store line text without line endings. Blank lines are represented as `['aN', '']`, so duplicate and empty HTML lines are safe.
- `renderHtmlDocument(document)` joins `lines[*][1]` with `lineEnding` and appends one final line ending when `finalNewline` is true.
- `createHtmlDocumentFromString(html)` detects LF/CRLF, normalizes internal work to LF, assigns anchors in order, and computes `checksum` from rendered HTML.
- `checksum` is recomputed on every write. Loading should tolerate absent legacy checksum only for migrations, then write the normalized schema.
- `splitEditText(text)` normalizes CRLF/CR to LF. For line-range edits, one trailing newline is treated as a copied block terminator, not an extra blank line; intentional extra blank lines are preserved.

Read/find output:

- Compact text lines use exactly `anchor|text`; split consumers at the first `|` only.
- `read` supports `range`, `offset`, and `limit`; `range` and `offset` are mutually exclusive. Omitted range reads from the top using `offset ?? 1` and `limit`.
- `find` defaults to literal substring search for speed and model predictability, with optional regex mode. It returns matched lines plus requested context as compact `anchor|text`, with `matchCount`, `returnedLines`, `totalLines`, `checksum`, and truncation metadata.
- Long display lines should be truncated for tool output, since edits target anchors rather than copied raw text.

Edit behavior:

- Input type: `edits: Array<{ operation: 'replace' | 'delete' | 'insert_before' | 'insert_after'; range: [] | [string] | [string, string]; text?: string }>` plus required `intent`.
- Validate the whole batch before changing the document: known anchors, ordered inclusive ranges, operation-specific text requirements, no overlapping replace/delete target ranges, and no no-op final render.
- All anchors resolve against the original pre-edit document. Multiple pure insertions at the same boundary are allowed and applied in input order; conflicting mutations fail the whole batch.
- Return concise metadata: `ok`, `operations`, `changedLines`, `firstChangedLine`, `firstChangedAnchor`, `lastChangedAnchor`, `bytes`, `checksum`, and a bounded `changedText` compact region. Reuse `countChangedLines`, `generateDiffString`, and/or `generateUnifiedPatch` only if tests/UI still need display diffs.

### Gotchas
- Content hashes alone are not safe anchors because repeated HTML lines such as `</div>` and blank lines collide.
- Stable anchors must be decoupled from text content; otherwise a small text edit invalidates nearby untouched references or creates collisions.

## Phase 3: Plan Project Storage Migration

### Description
Files to touch during implementation: `apps/server/src/mastra/lib/html-store.ts`, `apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/mastra/lib/project-store.test.ts`, and any server DOX docs whose source-of-truth wording changes.

Approach: extend the agent-facing store from a single string holder into a rendered view over an anchored document. New projects write only `html.json`; existing projects with only `index.html` migrate on first load by converting that HTML string to `html.json`. API callers continue to receive rendered `indexHtml` from `html.json`.

Acceptance criteria: creating a project persists `html.json` and does not create `index.html`; loading a project renders `indexHtml` from `html.json`; an old project containing only `index.html` is migrated; project image URL normalization still runs before persisted writes; existing client preview continues without client behavior changes.

### Todo
- [x] Define the store interface changes.
- [x] Define new project file helpers.
- [x] Define migration behavior from legacy `index.html`.
- [x] Define no-`index.html`-mirror behavior.
- [x] Define docs updates required by the storage contract change.

### Results
Store interface direction:

- Keep `HtmlStore.get(): string`, `reset(seed?: string): void`, and `set(html: string): number` so route, screenshot, and compatibility paths can still render full HTML.
- Add anchored document access/mutation methods, for example `getDocument(): HtmlDocumentJsonV1` and `setDocument(document: HtmlDocumentJsonV1): number`, so read/find/edit tools do not re-parse a string on every call.
- `createHtmlStore(initial?: string)` becomes an in-memory anchored document store for tests and Studio fallback.
- `createProjectHtmlStore(projectId)` loads `html.json` first. If missing, it reads legacy `index.html` or the placeholder, creates a document, writes `html.json`, and then treats that document as source.

Project storage direction:

- Add `const HTML_JSON = 'html.json'` and sync/async `readHtmlDocument*` / `writeHtmlDocument*` helpers in `project-store.ts`.
- `createProject()` writes `html.json` seeded from `PLACEHOLDER_INDEX_HTML`; returned `project.indexHtml` is rendered from the document.
- `getProject()` returns rendered HTML from `html.json`, migrating from legacy `index.html` if necessary.
- `setDocument()` persists project images against the rendered HTML, writes updated `html.json`, marks the project as having HTML, and updates metadata; it must not write `index.html`.
- `set(html)` remains available as whole-document replacement: it converts the HTML string into a fresh anchored document, then delegates to `setDocument()`.

Docs direction:

- Update server/mastra AGENTS wording that currently identifies `index.html` as source of truth.
- Document that `html.json` is the only ongoing HTML content file; legacy `index.html` is import-only migration input.

### Gotchas
- `project-store.ts` currently uses sync writes in the agent-facing store to avoid races before SSE tool-result emission; the anchored store should preserve that synchronous write-through behavior.
- Legacy migration must not destroy existing projects if `html.json` is malformed. Prefer a clear thrown error for corrupt `html.json`; only fall back to `index.html` when `html.json` is absent, then continue without writing future `index.html` mirrors.

## Phase 4: Plan Anchored Tool Integration

### Description
Files to touch during implementation: `apps/server/src/mastra/tools/read.ts`, new `apps/server/src/mastra/tools/find.ts`, `apps/server/src/mastra/tools/edit.ts`, `apps/server/src/mastra/tools/landing-tools.ts`, `apps/server/src/mastra/agents/landing-page-agent.ts`, `apps/server/src/mastra/route.ts`, related tool/route tests, and optionally removal or internalization of `apps/server/src/mastra/tools/grep.ts` / `apps/server/src/mastra/lib/grep-search.ts`.

Approach: switch the public agent tool workflow from read/grep/copy-oldText/edit to read/find anchors and apply operation/range edits. Keep tool result summaries compact and keep `html_update` generation based on `store.get()` unchanged.

Acceptance criteria: the agent tool list exposes `read`, `find`, and `edit`; `read`/`find` output compact anchors; `edit` accepts operation/range/text batches; route retry logic treats `read` or `find` as the required recovery before retrying failed edits; successful edits still trigger full `html_update` events.

### Todo
- [x] Define `read` schema and result shape.
- [x] Define `find` schema and result shape.
- [x] Define `edit` schema and result shape.
- [x] Define agent/tool guidance changes.
- [x] Define route summary/retry updates.

### Results
`read` tool direction:

- Input: `{ intent: string; range?: [] | [string] | [string, string]; offset?: number; limit?: number }`.
- Output: `{ ok: true; text: string; lines: number; totalLines: number; startAnchor?: string; endAnchor?: string; checksum: string; truncatedLines?: boolean }`.
- `text` is compact `anchor|text` only. Remove guidance that asks the agent to copy `rawText` into `edit.oldText`.

`find` tool direction:

- Input: `{ intent: string; text: string; regex?: boolean; ignoreCase?: boolean; context?: number; limit?: number }`.
- Literal search is default. Regex mode validates regex syntax and returns a non-throwing no-match/error result, following the current grep pattern.
- Output mirrors read's compact line format and includes `matchCount`, `returnedLines`, `matchLimitReached`, and `truncatedLines`.

`edit` tool direction:

- Input: `{ intent: string; edits: Array<{ operation; range; text? }> }` with no `path`, `oldText`, or `newText` public guidance.
- Operation semantics come from Phase 2. Batch validation is atomic and all ranges resolve against the original document.
- Output is concise changed-region metadata and never full HTML.

Agent/route direction:

- Update landing agent instructions from “read or grep exact snippets” to “read or find anchors, then edit anchor ranges.”
- Update `LANDING_TOOL_DEFINITIONS` to expose `find` instead of `grep`; retain `grep` only as internal code if it reduces implementation churn.
- Update `summarizeToolArgs()` / `summarizeToolResult()` for `find`, anchor ranges, and compact edit result fields.
- Update edit retry gating from `read`/`grep` to `read`/`find`.
- Keep `html_update` full rendered HTML and existing client `HtmlUpdateEvent` type unchanged.

### Gotchas
- Saved conversation parts store tool names as strings, so old persisted `grep` records can remain displayable without keeping `grep` as a live tool.
- If the public tool id changes to `find`, route tests and any text assertions around tool history must be updated.

## Phase 5: Plan Implementation and Verification Order

### Description
Files to touch during implementation are the source/test/doc files listed in Phases 2–4. This phase converts the design into an ordered implementation checklist and verification plan without writing code yet.

Acceptance criteria: implementation can proceed in small commits/todos, and verification commands are known before coding begins.

### Todo
- [x] Order implementation slices by dependency.
- [x] Map focused tests to each slice.
- [x] Record final verification commands.
- [x] Record DOX update requirements.

### Results
Recommended implementation order:

1. Add pure anchored document module and unit tests.
2. Convert in-memory `HtmlStore` to anchored documents while preserving `get()`/`set()` compatibility and existing edit/read tests where possible.
3. Migrate file-backed project storage to `html.json` with legacy `index.html` import tests.
4. Switch `read` and add `find` compact anchor tools; update registry/guidance and route summaries.
5. Switch `edit` to operation/range batches; update edit tests and route retry/html_update tests.
6. Update DOX docs for the new `html.json` source-of-truth contract.
7. Run focused server verification, then full relevant repo checks if focused checks pass.

Focused tests to add/update:

- `apps/server/src/mastra/lib/html-anchor-document.test.ts`: schema render/parse, anchor stability, batch edits, find/read formatting, stale/overlap failures.
- `apps/server/src/mastra/lib/project-store.test.ts`: create writes/reads only `html.json`, legacy migration from `index.html`, rendered `indexHtml` compatibility, and no new `index.html` creation.
- `apps/server/src/mastra/tools/read.test.ts` if added, or expand existing coverage through tool integration tests.
- `apps/server/src/mastra/tools/find.test.ts`: literal/regex/context/limit/truncation anchored output.
- `apps/server/src/mastra/tools/edit.test.ts`: operation/range edits, atomic multi-edit behavior, no full HTML in result.
- `apps/server/src/mastra/route.test.ts`: `html_update` still follows successful changed edit, failed edit retry gate now requires `read`/`find`.

Verification commands from repo root:

- Focused during implementation: `pnpm --filter @workspace/server test`, `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/server lint`.
- Final if server checks pass: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`.
- Build is optional for this server-only change unless typecheck/test reveal build-specific issues; run `pnpm run build` before a release-sized handoff.

DOX update requirements:

- Update `apps/server/AGENTS.md` and `apps/server/src/mastra/AGENTS.md` if they describe `index.html` as source of truth or list tool contracts.
- Root `AGENTS.md` likely does not need a child-index change because no durable top-level directory boundary is added.
- Client DOX likely remains unchanged because `GET project.indexHtml` and full `html_update.html` stay stable.

### Gotchas
- The implementation phase's skill contract requires one commit per completed implementation todo. Inspect git conventions before the first implementation commit.
- Do not begin implementation until this plan is accepted or the user explicitly asks to continue to the implementation phase.
