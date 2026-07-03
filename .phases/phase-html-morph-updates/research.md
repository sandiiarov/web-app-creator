# Research — html-morph-updates

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Clarifying Questions

1. Where does the current preview HTML refresh happen after a completed edit?
2. What server state is available before and after an edit to compute an HTML morph/update payload?
3. What SSE/API event contracts exist today, and where would a morph event or morph fetch response fit?
4. How does the client iframe preview load, sandbox, and communicate today?
5. What does `morphdom` expose, and can it produce serialized patch instructions server-side or only apply DOM-to-DOM mutations at runtime?
6. Is `idiomorph` a better fit than `morphdom` for whole-document HTML morphing in this app?
7. What tests and verification commands already cover the touched paths?
8. What DOX documents own the likely code paths?

## Phase 1: Map current preview update flow

### Description
Locate the client and server modules that move generated project HTML from persisted storage into the iframe preview, including SSE events after edits, fetch paths, and preview iframe behavior.

### Todo
- [x] Read applicable app DOX files for likely client/server paths.
- [x] Inspect client project loading, SSE handling, and iframe preview components.
- [x] Inspect server Mastra route/edit tool/project store paths around HTML writes and events.
- [x] Record current inputs, outputs, and side effects with file citations.

### Results
- Client DOX states the current contract explicitly: there is no `html` SSE event and no client PUT; after each successful `edit` tool completes, `use-landing-page.ts` calls `GET /api/projects/:id` and pulls updated HTML (`apps/client/AGENTS.md`).
- Server DOX mirrors that contract: `POST /agent` streams `thinking`, `text`, `tool_call`, `retry`, `screenshot_request`, `stats`, `error`, and `done`; after an `edit`, the client pulls updated HTML via `GET /api/projects/:id` (`apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`).
- On editor mount or project switch, `useLandingPage` calls `getProject(projectId)`, expands project image URLs, stores `project.indexHtml` in React state, restores persisted messages, and optionally applies the saved model (`apps/client/src/hooks/use-landing-page.ts`).
- `refreshHtml` is the edit-refresh path: it calls `getProject(projectId)` and then `setHtml(expandProjectImageUrls(project.indexHtml))`; errors are swallowed because the streaming run reports hard failures (`apps/client/src/hooks/use-landing-page.ts`).
- The client SSE handler treats `tool_call` events as display parts. When `payload.tool === 'edit' && payload.state === 'done'`, it increments `turn.htmlSwaps` and calls `refreshHtml()` (`apps/client/src/hooks/use-landing-page.ts`).
- `LandingPreview` renders the current `html` prop as an iframe `srcDoc` after `preparePreviewSrcDoc(html)` injects a client-only `<base href="about:srcdoc">`; changing the `srcDoc` prop replaces/reloads the iframe document (`apps/client/src/components/landing-preview.tsx`, `apps/client/src/lib/preview-srcdoc.ts`).
- `getProject` fetches `GET ${SERVER_URL}/api/projects/:id` and returns full metadata plus `indexHtml` and `messages`; `expandProjectImageUrls` rewrites root-relative project image URLs to absolute URLs for sandboxed srcDoc iframes (`apps/client/src/lib/projects-api.ts`).
- The server `edit` tool reads `before = store.get()`, computes `after = applyEdits(before, edits)`, persists with `store.set(after)`, then returns bytes, changed-line count, diff, first changed line, patch, and replacements; it does not return full HTML (`apps/server/src/mastra/tools/edit.ts`).
- `createProjectHtmlStore(projectId)` is a sync write-through store. Its `set` normalizes generated image URLs, writes `index.html`, marks `hasHtml`, updates `updatedAt`, and updates the in-memory request-local `html` string before Mastra emits the edit tool result (`apps/server/src/mastra/lib/project-store.ts`).
- In `streamLandingAgent`, a successful `tool-result` for `edit` records a terminal `tool_call` event and increments `recordedTurn.htmlSwaps`; comments state the UI pulls updated HTML on edit-done and no `html` event is pushed (`apps/server/src/mastra/route.ts`).
- The project REST router handles `GET /api/projects/:id` through `handleGetProject`, which serializes the full project including `indexHtml` (`apps/server/src/index.ts`, `apps/server/src/mastra/lib/project-store.ts`).

### Gotchas
- The current preview update is a React `srcDoc` replacement, so same-document browser state, scroll, focus, and JS runtime inside the iframe are reset on every edit (`apps/client/src/components/landing-preview.tsx`).
- Screenshot capture deliberately fetches the latest full project HTML independently of the editor preview before rendering an offscreen iframe (`apps/client/src/hooks/use-landing-page.ts`).

## Phase 2: Research morphdom capabilities and constraints

### Description
Scrape the requested morphdom repository documentation and inspect the npm package shape if available, focusing on whether it generates patch instructions or applies mutations directly.

### Todo
- [x] Scrape `https://github.com/patrick-steele-idem/morphdom` into `.firecrawl/` as source evidence.
- [x] Read the scraped morphdom evidence.
- [x] Check package/dependency availability and TypeScript types for `morphdom`.
- [x] Record facts about API shape, browser/server feasibility, and serialization limits.

### Results
- Source evidence saved at `.firecrawl/morphdom-github-2026-07-02.md`.
- `morphdom` is documented as a lightweight module for morphing an existing DOM node tree to match a target DOM node tree while avoiding wholesale replacement and preserving state like scroll positions, input caret positions, and CSS transition state (`.firecrawl/morphdom-github-2026-07-02.md`).
- The documented usage calls `morphdom(el1, el2)` or `morphdom(el1, '<div class="bar">...</div>')`; the function directly mutates the original DOM node tree and may also mutate the target tree during transformation (`.firecrawl/morphdom-github-2026-07-02.md`).
- The public API is `morphdom(fromNode, toNode, options): Node`, where `toNode` can be a DOM `Node` or `String`; options include callbacks such as `getNodeKey`, `addChild`, `onBeforeNodeAdded`, `onNodeAdded`, `onBeforeElUpdated`, `onElUpdated`, `onBeforeNodeDiscarded`, `onNodeDiscarded`, `onBeforeElChildrenUpdated`, `childrenOnly`, and `skipFromChildren` (`.firecrawl/morphdom-github-2026-07-02.md`).
- The scraped docs describe callbacks that customize or observe DOM mutation, but they do not describe a built-in API for returning serialized patch instructions from server to client (`.firecrawl/morphdom-github-2026-07-02.md`).
- `morphdom` compares and patches real DOM nodes; the README says the browser-maintained real DOM remains the source of truth and that it can also diff a real DOM tree against a virtual DOM tree with a minimal DOM-like API (`.firecrawl/morphdom-github-2026-07-02.md`).
- The npm package metadata reports `morphdom@2.7.8`, `main = dist/morphdom.js`, `module = dist/morphdom-esm.js`, `types = ./index.d.ts`, no dependencies, and MIT license (`pnpm view morphdom version main module types typings`, `pnpm view morphdom dependencies peerDependencies license`).
- The workspace does not currently depend on `morphdom`, and no installed `node_modules/morphdom*/package.json` was found (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules`).

### Gotchas
- Running `morphdom` "on the server" would require a DOM implementation or a custom DOM-like tree; the documented package itself patches nodes rather than emitting a transportable instruction list (`.firecrawl/morphdom-github-2026-07-02.md`).
- The current app already has previous and next HTML strings inside the server edit tool (`apps/server/src/mastra/tools/edit.ts`), but the browser iframe has the live DOM state that morphdom is designed to patch (`apps/client/src/components/landing-preview.tsx`).

## Phase 3: Research Idiomorph capabilities and compare to morphdom

### Description
Scrape and inspect `idiomorph`, focusing on whole-document/head-aware morphing, API shape, package metadata, and whether it better fits iframe preview updates than `morphdom`.

### Todo
- [x] Scrape `https://www.npmjs.com/package/idiomorph` into `.firecrawl/` as source evidence.
- [x] Inspect npm metadata/readme for package exports, types, dependencies, and API shape.
- [x] Compare documented Idiomorph behavior with morphdom for this app's iframe preview use case.
- [x] Record facts and open constraints with file/source citations.

### Results
- Source evidence saved at `.firecrawl/idiomorph-npm-2026-07-02.md` and `.firecrawl/idiomorph-github-2026-07-02.md`.
- Idiomorph is documented as a DOM-tree morphing library inspired by morphdom and nanomorph; it preserves existing nodes when matched so state such as focus can be retained (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph's distinguishing feature is `id sets`: before matching, old and new content are processed into mappings of each element to the set of ids found inside it, allowing id-less parent elements to match based on children and reducing unnecessary detachments versus morphdom in nested/id-on-leaf cases (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph has explicit whole-document usage: `Idiomorph.morph(document.documentElement, newPageSource, { head: { style: 'morph' } })` is documented for merging a whole page (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph treats `<head>` specially. Default `head.style: 'merge'` keeps elements present in both heads, adds new head elements, and removes stale head elements to minimize network reloads; `head.style` can be `merge`, `append`, `morph`, or `none` (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph options include `morphStyle: 'outerHTML' | 'innerHTML'`, `ignoreActive`, `ignoreActiveValue`, `restoreFocus`, `head`, and lifecycle callbacks such as `beforeNodeAdded`, `afterNodeAdded`, `beforeNodeMorphed`, `afterNodeMorphed`, `beforeNodeRemoved`, `afterNodeRemoved`, and `beforeAttributeUpdated` (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph's docs say it is not designed to be as fast as morphdom/nanomorph; benchmarks claim it is about equal to 10% slower than morphdom for large morphs and equal to or faster for smaller morphs, prioritizing better DOM matching (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- The docs cite Turbo using Idiomorph for full page refreshing and Datastar using Idiomorph as its default merge strategy (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Package metadata reports `idiomorph@0.7.4`, `main = dist/idiomorph.js`, `module = dist/idiomorph.esm.js`, dependency-free, `exports` for `require`/`import`, `./htmx`, and `./dist/*`, repository `https://github.com/bigskysoftware/idiomorph`, license `0BSD`, and no built-in `types`/`typings` field (`pnpm view idiomorph version description main module types typings dependencies peerDependencies license repository homepage`, `pnpm view idiomorph files exports dist.tarball`).
- `@types/idiomorph` is not published in the npm registry, so strict TypeScript use would require a local declaration or typed wrapper if imported directly (`pnpm view @types/idiomorph version description dependencies`).
- The workspace does not currently depend on `idiomorph` or `morphdom` (`pnpm-workspace.yaml`, `pnpm-lock.yaml`).
- Compared with morphdom, Idiomorph appears better aligned with generated single-file page previews because it documents whole-page morphing, head-merge controls, focus restoration, active-element options, and stronger matching when ids live on nested/leaf elements (`.firecrawl/idiomorph-npm-2026-07-02.md`, `.firecrawl/morphdom-github-2026-07-02.md`).

### Gotchas
- Like morphdom, Idiomorph's documented API mutates DOM nodes in place and accepts a target node/string; it does not document a server-side serialized instruction/patch protocol (`.firecrawl/idiomorph-npm-2026-07-02.md`).
- Idiomorph lacks published TypeScript types, while morphdom publishes `./index.d.ts`; this is an integration cost for the strict TypeScript client (`pnpm view morphdom version main module types typings`, `pnpm view idiomorph version description main module types typings`).

## Phase 4: Map existing test/build patterns and boundary docs

### Description
Identify focused tests and commands that would verify the morph update feature, and record DOX implications for new dependencies/events.

### Todo
- [x] Inspect package scripts and existing tests around client agent events, preview srcdoc, and server route/edit behavior.
- [x] Inspect lockfile/workspace catalog conventions for adding client/server dependencies.
- [x] Identify AGENTS.md updates required by new SSE/API contracts or preview update behavior.
- [x] Record exact verification commands for implementation and final verification.

### Results
- Root scripts delegate through Turbo: `build`, `format:check`, `lint`, `test`, and `typecheck` run `turbo run ...` (`package.json`).
- Focused client scripts are `pnpm --filter @workspace/client typecheck`, `lint`, `test`, `build`, and `format:check`; tests use Vitest through `vitest run --config vitest.config.ts` and shared `createVitestConfig()` (`apps/client/package.json`, `apps/client/vitest.config.ts`).
- Focused server scripts are `pnpm --filter @workspace/server typecheck`, `lint`, `test`, `build`, and `format:check`; tests use Vitest through `vitest run --config vitest.config.ts` and shared `createVitestConfig()` (`apps/server/package.json`, `apps/server/vitest.config.ts`).
- Current client tests cover `preparePreviewSrcDoc` and formatting helpers only; there is no existing `useLandingPage` or iframe-morph test (`apps/client/src/components/landing-preview.test.ts`, `apps/client/src/lib/landing-agent.test.ts`, `apps/client/src/hooks/use-landing-page.ts`).
- Server tests cover `streamLandingAgent` SSE behavior, project storage, edit diffing, and the edit tool; `route.test.ts` already parses custom SSE output and validates tool events/stats/retry/screenshot behavior (`apps/server/src/mastra/route.test.ts`, `apps/server/src/mastra/lib/project-store.test.ts`, `apps/server/src/mastra/tools/edit.test.ts`, `apps/server/src/mastra/lib/edit-diff.test.ts`).
- Dependencies must use the root `pnpm-workspace.yaml` catalog because `catalogMode: strict` is enabled; app `package.json` dependencies should use `"catalog:"` for cataloged third-party packages (`pnpm-workspace.yaml`, `apps/client/package.json`, `apps/server/package.json`).
- TypeScript is strict with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `erasableSyntaxOnly`, so an untyped Idiomorph import will need either a local declaration, typed wrapper, or another type-safe integration approach (`packages/typescript-config/base.json`, `apps/client/tsconfig.json`).
- DOX updates are required if the preview update contract changes from full project fetch/srcDoc replacement to morph payload/event application: at minimum `apps/client/AGENTS.md`, `apps/server/AGENTS.md`, and `apps/server/src/mastra/AGENTS.md` own the current no-`html`/pull-on-edit contract (`apps/client/AGENTS.md`, `apps/server/AGENTS.md`, `apps/server/src/mastra/AGENTS.md`).
- Commit convention is Conventional Commit-style subjects with phase tags for phase implementation commits, e.g. `feat(client): ... [image-recognition-ocr][phase-2][client-attachment-ui]` (`git log --oneline -20`).

Verification commands discovered for implementation/final verification:
- `pnpm --filter @workspace/client typecheck`
- `pnpm --filter @workspace/client lint`
- `pnpm --filter @workspace/client test`
- `pnpm --filter @workspace/client build`
- `pnpm --filter @workspace/client format:check`
- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server test`
- `pnpm --filter @workspace/server build`
- `pnpm --filter @workspace/server format:check`
- `git diff --check`

### Gotchas
- Idiomorph has no published TypeScript types, so any direct import can break client typecheck unless typed locally (`pnpm view idiomorph version description main module types typings`).
- The current screenshot path intentionally fetches full HTML independently from the live preview, so preview morphing and screenshot capture are separate flows (`apps/client/src/hooks/use-landing-page.ts`).
