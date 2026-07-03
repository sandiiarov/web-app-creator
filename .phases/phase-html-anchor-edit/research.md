# Research — html-anchor-edit

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Frame Research Questions

### Description
Convert the user's anchored-single-HTML editing idea into neutral questions about the current repository: where HTML is produced, where edit/read/find-like tools live, and what existing constraints matter.

### Todo
- [x] Record neutral research questions without choosing an implementation.
- [x] Identify likely repository areas to inspect.

### Results
Research questions:

1. Where does the repository currently represent generated single-file HTML, and is it stored as a string, streamed chunks, files, or structured state? (`AGENTS.md`)
2. Which client/server surfaces currently move generated HTML between agent, API, SSE stream, UI state, and iframe preview? (`AGENTS.md`)
3. Are there existing read/edit/find-like agent tools, or only a generation/validation pipeline? (`AGENTS.md`)
4. What current schemas, validation, and error patterns would constrain a future anchored-line edit tool? (`AGENTS.md`)
5. What focused verification commands apply to future changes in the relevant workspaces? (`AGENTS.md`)

Likely repository areas to inspect from the root Child DOX Index and project contract:

- `apps/client/` owns the Vite/React browser UI, custom SSE client, and direct iframe preview. (`AGENTS.md`)
- `apps/server/` owns the Node API, env contract, and generated Mastra output boundary. (`AGENTS.md`)
- `apps/server/src/mastra/` owns the landing-page agent, tools, skills, model/cost/SSE logic. (`AGENTS.md`)
- Root workspace scripts/config define repo-wide verification and Turborepo task routing. (`AGENTS.md`, `package.json`, `turbo.json`)

### Gotchas
The user's proposed `html.json` source-of-truth is not yet established by current root docs; research must first map the existing HTML flow before planning storage changes. (`AGENTS.md`)

## Phase 2: Map Current HTML Flow

### Description
Find how generated single-file HTML is represented, streamed, previewed, and stored today across the client/server path.

### Todo
- [x] Read applicable AGENTS.md files for inspected app/server/client paths.
- [x] Locate HTML-related types, API routes, SSE parsing, and preview rendering.
- [x] Record inputs, outputs, and side effects for the current HTML flow.

### Results
Current HTML storage and project lifecycle facts:

- Project storage is file-backed under `apps/server/src/mastra/.data/projects/<id>/` with `project.json`, `index.html`, `messages.json`, and `images/`; `index.html` is documented as the landing page source of truth. (`apps/server/src/mastra/lib/project-store.ts`)
- `createProject()` creates a UUID project, writes metadata, writes `PLACEHOLDER_INDEX_HTML` to `index.html`, writes empty `messages.json`, and returns `{ ...meta, indexHtml: PLACEHOLDER_INDEX_HTML, messages: [] }`. (`apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/mastra/lib/html-store.ts`)
- `PLACEHOLDER_INDEX_HTML` is a complete HTML string with doctype, `<html lang="en">`, `<head>`, `<body>`, and placeholder `<main>` content. (`apps/server/src/mastra/lib/html-store.ts`)
- `createProjectHtmlStore(projectId)` loads the current `index.html` or placeholder into an in-memory string and exposes `get/reset/set`; `set()` normalizes project image URLs, writes `index.html`, marks project metadata `hasHtml: true`, updates `updatedAt`, and returns the UTF-8 byte count. (`apps/server/src/mastra/lib/project-store.ts`)
- `getProject(id)` returns metadata plus the current `indexHtml` string and persisted messages; if `index.html` cannot be read, it returns an empty string for `indexHtml`. (`apps/server/src/mastra/lib/project-store.ts`)

Current HTTP/API flow facts:

- Client route `/projects/new` calls `createProject({ model })` and redirects to `/projects/:id` once the server returns a project id. (`apps/client/src/components/projects-page.tsx`, `apps/client/src/main.tsx`)
- `POST /api/projects` calls server `createProject()` and returns `{ ok: true, project }`; `GET /api/projects/:id` returns `{ ok: true, project }` where `project.indexHtml` is the server-owned HTML string. (`apps/server/src/index.ts`, `apps/client/src/lib/projects-api.ts`)
- `POST /agent` validates `{ prompt, projectId, model?, attachments? }`, then calls `streamLandingAgent()` with the project id and resolved model. (`apps/server/src/index.ts`)
- `streamLandingAgent()` validates the project, updates project model/title, creates a project-scoped `createProjectHtmlStore(projectId)`, and passes that store to `createLandingPageAgent()`. (`apps/server/src/mastra/route.ts`)
- After each successful `edit` tool result, `streamLandingAgent()` compares `store.get()` with the previous streamed HTML; if changed, it sends `html_update` with `projectId`, monotonic `sequence`, full `html`, byte count, SHA-256 `hash`, and SHA-256 `previousHash`. (`apps/server/src/mastra/route.ts`)

Current client preview facts:

- `useLandingPage()` loads `GET /api/projects/:id` on mount, expands persisted project image URLs, and stores `project.indexHtml` in React state as `html`. (`apps/client/src/hooks/use-landing-page.ts`, `apps/client/src/lib/projects-api.ts`)
- On SSE `html_update`, `useLandingPage()` updates preview state only when the event `projectId` matches the current project; tool-call `edit done` increments a UI `htmlSwaps` counter but does not fetch HTML. (`apps/client/src/hooks/use-landing-page.ts`)
- `LandingPreview` renders a sandboxed iframe with `srcDoc`; initial HTML or script changes reload `srcDoc`, while routine changes call `morphPreviewDocument()` and Idiomorph morphs the iframe document. (`apps/client/src/components/landing-preview.tsx`, `apps/client/src/lib/preview-morph.ts`)
- Preview rendering injects a client-only `<base href="about:srcdoc" data-preview-base="true" />` into the HTML before iframe load/morph; this is not persisted into project HTML. (`apps/client/src/lib/preview-srcdoc.ts`)

### Gotchas
- Current `html_update` emits the full HTML string after every changed edit, even though the edit tool result itself returns concise metadata. (`apps/server/src/mastra/route.ts`, `apps/client/src/hooks/use-landing-page.ts`)
- The current persisted source of truth is explicitly `index.html`; replacing it with `html.json` would change a documented server/client/agent contract, not just a tool implementation detail. (`apps/client/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`, `apps/server/src/mastra/lib/project-store.ts`)

## Phase 3: Map Existing Agent Tools

### Description
Locate any existing Mastra tools or agent actions that read, edit, find, validate, or return HTML so future planning can reuse or replace concrete surfaces.

### Todo
- [x] Locate Mastra tool definitions and agent instructions relevant to HTML generation/editing.
- [x] Record each relevant tool's input schema, output shape, and side effects.
- [x] Record current error-handling and validation patterns.

### Results
Agent/tool registry facts:

- `landing-page-agent` instructions state the agent builds and refines a single self-contained `/index.html` with the tool list from `landing-tools.ts`. (`apps/server/src/mastra/agents/landing-page-agent.ts`)
- The agent instruction explicitly tells the model to use one `edit` call with an `edits` array for related non-overlapping replacements, read/grep exact snippets first, target smallest unique `oldText` blocks, and pass `intent` on tools that accept it. (`apps/server/src/mastra/agents/landing-page-agent.ts`)
- `landing-tools.ts` is the registry source of truth for enabled tools; it currently enables `scrape`, `read`, `grep`, `edit`, `screenshot`, and `generate_image`, and passes the same project `HtmlStore` into read/grep/edit. (`apps/server/src/mastra/tools/landing-tools.ts`)

Current `read` tool facts:

- `read` input schema is `{ intent: string, offset?: positive int, limit?: positive int }`; path is not an input because it always reads `/index.html`. (`apps/server/src/mastra/tools/read.ts`)
- `read` normalizes CRLF/CR to LF for display, splits current `store.get()` into lines, slices from 1-indexed `offset` with default `limit` 2000, and returns `rawText`, `numberedText`, combined `text`, `lines`, and `totalLines`. (`apps/server/src/mastra/tools/read.ts`)
- `read.numberedText` prefixes each line as padded line number plus two spaces; its `text` tells the agent that `rawText` is for `edit.oldText` and numbered output is navigation-only. (`apps/server/src/mastra/tools/read.ts`)

Current `grep` tool facts:

- `grep` input schema is `{ pattern: string, intent: string, literal?: boolean, ignoreCase?: boolean, context?: nonnegative int, limit?: positive int }`; it always searches `/index.html`. (`apps/server/src/mastra/tools/grep.ts`)
- `grepHtml()` searches the in-memory HTML string line-by-line after LF normalization; regex is default, `literal` escapes the pattern, default context is 0, default limit is 100, and display lines truncate beyond 500 chars. (`apps/server/src/mastra/lib/grep-search.ts`)
- `grep` returns `rawMatches` as `{ lineNumber, text }[]`, plus display `text`, `matchCount`, `matchLimitReached`, and `truncatedLines`; its display text tells the agent to use `rawMatches` or follow-up `read` for edit inputs. (`apps/server/src/mastra/tools/grep.ts`, `apps/server/src/mastra/lib/grep-search.ts`)
- Invalid regex returns a non-throwing `GrepResult` with `matchCount: 0`, empty `matches`, and a notice in `output`; zero matches returns `output: 'No matches found'`. (`apps/server/src/mastra/lib/grep-search.ts`)

Current `edit` tool facts:

- `edit` input schema accepts preferred `edits: [{ oldText: string, newText: string }]`, also tolerates `edits` as a JSON string, and has legacy top-level `oldText`/`newText`; `intent` is required and `path` is optional but restricted to `/index.html` or `index.html`. (`apps/server/src/mastra/tools/edit.ts`)
- `edit` reads `before = store.get()`, applies all replacements with `applyEdits(before, edits)`, writes via `store.set(after)`, then returns metadata: `bytes`, `changedLines`, display `diff`, `firstChangedLine`, `ok`, unified `patch`, and replacement count. (`apps/server/src/mastra/tools/edit.ts`)
- `edit` does not return full HTML; an existing test asserts the result has no `html` property and that the store contains changed content. (`apps/server/src/mastra/tools/edit.test.ts`)
- `applyEdits()` strips/preserves BOM, detects/preserves original LF vs CRLF endings, normalizes matching content to LF, and applies edits against original document content, not incrementally. (`apps/server/src/mastra/lib/edit-diff.ts`)
- `applyEditsToNormalizedContent()` rejects empty `oldText`, not-found matches, duplicate matches, overlapping matches, and no-op replacements. (`apps/server/src/mastra/lib/edit-diff.ts`)
- Matching mode is chosen across the batch: exact first, then fuzzy normalization, then indentation-insensitive; fuzzy normalization applies NFKC, trims trailing whitespace per line, normalizes smart quotes/dashes/special spaces, and indentation-insensitive mode removes leading tabs/spaces before matching. (`apps/server/src/mastra/lib/edit-diff.ts`)
- If `oldText` was copied from `read`/`grep` numbered output, `stripCopiedLinePrefixes()` can remove read-style `N  text` and grep-style `N: text` / `N- text` prefixes when every non-empty line has a prefix. (`apps/server/src/mastra/lib/edit-diff.ts`)
- On edit tool errors, `streamLandingAgent()` marks the tool call as error, requires a successful `read` or `grep` before another `edit`, and stops the run after repeated edit failures. (`apps/server/src/mastra/route.ts`)

### Gotchas
- The existing `read`/`grep` tools intentionally expose raw unnumbered text for `edit.oldText`; numbered output is explicitly navigation-only, so an anchored read output would alter current tool guidance and agent instructions. (`apps/server/src/mastra/tools/read.ts`, `apps/server/src/mastra/tools/grep.ts`, `apps/server/src/mastra/tools/landing-tools.ts`, `apps/server/src/mastra/agents/landing-page-agent.ts`)
- The current `edit` API is replacement-only; it has no operation enum, range anchors, insert-before/after, or delete operation as first-class schema fields. (`apps/server/src/mastra/tools/edit.ts`)
- Current edit matching supports fuzzy text fallbacks, but still requires the agent to provide old content; it has no persisted line-anchor store or stable per-line identifiers. (`apps/server/src/mastra/lib/edit-diff.ts`, `apps/server/src/mastra/tools/edit.ts`)

## Phase 4: Record Verification and Constraints

### Description
Capture existing test/build/typecheck commands and repository constraints relevant to any later implementation plan.

### Todo
- [x] Inspect package scripts and focused workspace scripts.
- [x] Record applicable verification commands with working directory and flags.
- [x] Note open questions that require user input before planning.

### Results
Repository verification commands already documented in DOX:

- Full repo from `/Users/alexsandiiarov/Documents/web-app-creator`: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`. (`AGENTS.md`)
- Focused client from `/Users/alexsandiiarov/Documents/web-app-creator`: `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, `pnpm --filter @workspace/client test`, `pnpm --filter @workspace/client build`. (`apps/AGENTS.md`, `apps/client/AGENTS.md`, `apps/client/package.json`)
- Focused server from `/Users/alexsandiiarov/Documents/web-app-creator`: `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/server lint`, `pnpm --filter @workspace/server test`, `pnpm --filter @workspace/server build`. (`apps/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/package.json`)

Script/config facts relevant to later planning:

- Root scripts delegate through `turbo run`; package scripts own task logic. (`package.json`, `turbo.json`, `AGENTS.md`)
- Client and server both use `tsgo --noEmit -p tsconfig.json` for typecheck, `oxlint .` for lint, `oxfmt -c oxfmt.config.ts --check .` for format checking, and `vitest run --config vitest.config.ts` for tests. (`apps/client/package.json`, `apps/server/package.json`)
- Workspaces live under `apps/*` and `packages/*`; dependency versions are managed via the root pnpm catalog with `catalogMode: strict`. (`pnpm-workspace.yaml`, `AGENTS.md`)
- Server `.data/` persists project runtime files and is local-only/gitignored by contract; generated Mastra output and DB files are not source-edit targets. (`apps/server/AGENTS.md`, `AGENTS.md`)

Open questions before planning:

1. Should the persisted source of truth actually change from `.data/projects/<id>/index.html` to an ordered `html.json`, or should an anchored representation be derived alongside `index.html` to preserve current REST/SSE/preview contracts? (`apps/server/src/mastra/lib/project-store.ts`, `apps/server/AGENTS.md`, `apps/client/AGENTS.md`)
2. Should the client continue receiving full `html_update.html` payloads after every changed edit, or should future work reduce SSE payload size too? (`apps/server/src/mastra/route.ts`, `apps/client/src/hooks/use-landing-page.ts`)
3. Should anchors be stable opaque IDs that survive text changes, content-derived hashes that change with text, or a combination of stable ID plus content hash/version for stale-edit detection? Current code has only whole-HTML SHA-256 in `html_update`, not line anchors. (`apps/server/src/mastra/route.ts`, `apps/server/src/mastra/lib/edit-diff.ts`)
4. Should future `read`/`grep` preserve raw unnumbered text for backward-compatible oldText editing, or fully switch model guidance to anchored output? (`apps/server/src/mastra/tools/read.ts`, `apps/server/src/mastra/tools/grep.ts`, `apps/server/src/mastra/tools/landing-tools.ts`)
5. Should the future `edit` API be replacement-only compatible with current `edits`, or a breaking operation/range API such as `{ operation, range, text }` / batch `edits`? (`apps/server/src/mastra/tools/edit.ts`, `apps/server/src/mastra/agents/landing-page-agent.ts`)

### Gotchas
- Any implementation touching Mastra tools should update the server tool schemas, `landing-tools.ts` guidance, agent instructions, route SSE behavior if payloads change, client event types if SSE changes, and relevant DOX if contracts change. (`apps/server/src/mastra/AGENTS.md`, `apps/server/src/mastra/tools/edit.ts`, `apps/server/src/mastra/tools/landing-tools.ts`, `apps/server/src/mastra/agents/landing-page-agent.ts`, `apps/client/src/lib/landing-agent.ts`)
- No verification commands were run during research because this phase only inspected files and wrote phase notes. (`.phases/phase-html-anchor-edit/research.md`)
