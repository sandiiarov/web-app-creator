# Plan 010: Export the generated landing page as a standalone single-file HTML

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md`.
>
> This is a **direction spike**: the first two steps are investigation that
> pins down one design decision (how images become portable), then the plan
> implements the minimal version. Do the investigation before writing code.
>
> **Drift check (run first)**:
> `git diff --stat 4e199c45..HEAD -- apps/client/src/App.tsx apps/client/src/hooks/use-landing-page.ts apps/client/src/lib/projects-api.ts apps/server/src/index.ts apps/server/src/mastra/lib/project-store.ts packages/prompt-panel/src/prompt-panel.tsx`
> If any in-scope file changed since this plan was written, compare "Current
> state" against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (the only real risk is the image-inlining path — see Step 1)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4e199c45`, 2026-07-07

## Why this matters

The product's entire purpose is to produce a **single-file HTML landing page**.
Today the server stores the HTML and the client previews it in a sandboxed
iframe — but there is **no way for the user to get the file out**. A grep for
`download|export|Blob|createObjectURL` across `apps/client` and
`packages/prompt-panel` finds only TypeScript `export` keywords, one
`new Blob([attachment.html])` used to *measure* an attachment's size, and a
`download:false` markdown-viewer setting. The generated HTML only lives behind
`GET /api/projects/:id` (JSON) and inside the preview iframe. The last step of
the product loop is missing.

Complication that makes this a spike, not a one-liner: generated pages reference
images as `/api/projects/<id>/images/<file>`, and the client rewrites those to
absolute `http://localhost:3001/...` URLs (`expandProjectImageUrls`). A
downloaded file opened off-server would show **broken images**. A *standalone*
single-file export — which is what "single-file HTML landing page" promises —
needs the images **inlined as `data:` URLs**.

## Current state

The facts the executor needs (recon-read at `4e199c45`):

- `apps/client/src/App.tsx` — `EditorPage` renders `<LandingPreview html={landing.html} …/>` and `<PromptPanel …/>`. The panel header holds existing actions (`onAllProjects`, `onToggleTheme`). A "Download HTML" action belongs in that header chrome.
- `apps/client/src/hooks/use-landing-page.ts` — holds `landing.html` (the **already-expanded** HTML, image URLs rewritten to absolute localhost URLs at line ~207) and `landing.turns`. Exposes `send`/`stop`/`setModels`.
- `apps/client/src/lib/projects-api.ts:65` — `expandProjectImageUrls(html)`:
  ```ts
  export function expandProjectImageUrls(html: string): string {
    const pattern = /\/api\/projects\/[a-f0-9-]+\/images\/[^"')\]]+/gi
    return html.replace(pattern, (match) =>
      match.startsWith('http') ? match : `${SERVER_URL}${match}`,
    )
  }
  ```
- `apps/server/src/index.ts` — HTTP router. Project routes are regex-matched; image/screenshot filenames are path-traversal-guarded by `isSafeImageName`/`isSafeScreenshotName` in `project-store.ts`. `GET /api/projects/:id/images/:file` serves image bytes (`serveProjectImage`).
- `apps/server/src/mastra/lib/project-store.ts` — owns `.data/projects/<id>/`; `getProject(id)` returns `{ indexHtml, … }` (raw HTML, image URLs **not** yet expanded). `readProjectImage(id, file)` reads image bytes.
- `packages/prompt-panel/src/prompt-panel.tsx` — `PromptPanel` props include `onAllProjects`, `onToggleTheme`; header is `<PanelHeader />` (imported from `./panel-header`). The new download action slots in alongside these.

Repo conventions to match:
- Server input validation + route registration: see `apps/server/src/index.ts` (`PROJECT_*_RE` regexes, `routeProjects`, `sendJson`, `setCorsHeaders`). New route follows the same shape.
- Client API helpers: see `apps/client/src/lib/projects-api.ts` (`getProject`, `postScreenshotResponse` — typed `fetch` + `json.ok` guard). New helper follows the same shape.
- Lint/format: `oxlint` (perfectionist sort) + `oxfmt` — run `pnpm --filter <pkg> lint --fix` then `format` after edits. The 90% line-coverage gate applies to the **server** only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Server focused tests | `pnpm --filter @workspace/server test -- --run` | all pass; coverage gate green |
| Server typecheck/lint/format | `pnpm --filter @workspace/server typecheck && pnpm --filter @workspace/server lint --fix && pnpm --filter @workspace/server format` | exit 0 |
| Client checks | `pnpm --filter @workspace/client typecheck && pnpm --filter @workspace/client lint --fix && pnpm --filter @workspace/client format` | exit 0 |
| prompt-panel checks | `pnpm --filter @workspace/prompt-panel typecheck && pnpm --filter @workspace/prompt-panel lint --fix && pnpm --filter @workspace/prompt-panel format` | exit 0 |

## Scope

**In scope** (modify these, plus new test files):
- `apps/server/src/index.ts` — add the `GET /api/projects/:id/html` route (see Step 2 decision).
- `apps/server/src/mastra/lib/project-store.ts` — add an HTML-with-inlined-images reader (or reuse `readProjectImage`).
- `apps/server/src/index.ts` test or `route` test — cover the new route.
- `apps/client/src/lib/projects-api.ts` — add a `downloadProjectHtml(id)` helper (or the trigger lives entirely in the panel).
- `packages/prompt-panel/src/prompt-panel.tsx` (+ `panel-header.tsx`) — add a "Download HTML" action.
- `apps/client/src/App.tsx` — wire the action to the project id.

**Out of scope** (do NOT touch):
- The agent, the edit engine, the SSE stream — unrelated.
- Image generation/storage — read-only here.
- Changing the on-disk HTML format or `expandProjectImageUrls` behavior (the preview path must not change).

## Git workflow

- Branch: `advisor/010-export-generated-html`.
- Commit per logical unit (server route; client helper; panel action), message style matching `git log` (e.g. `feat(server): add GET /api/projects/:id/html export route [plan-010]`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: INVESTIGATE — decide the image strategy (do this before coding)

The generated HTML references images via `/api/projects/<id>/images/<file>`.
Decide between:

- **(A) Standalone single-file — inline images as `data:` URLs (RECOMMENDED).**
  The server reads each referenced image's bytes (`readProjectImage`) and
  substitutes `data:<mediaType>;base64,…` into the HTML before serving. One
  fetch from the client; truly portable; matches the "single-file" promise.
  Cost: server does the substitution (it already owns the bytes + the
  `mediaTypeForName` helper).
- **(B) Non-standalone — serve the HTML with absolute `http://<host>/…` image
  URLs.** Trivial, but images break the moment the server is down or the file
  is moved. Only acceptable if the user is told this limitation.

Record the decision in the plan's status row note. **Default if unsure: (A).**

**Verify**: write a one-paragraph decision note as a comment at the top of your
new server helper documenting which option + why. (No command — this is a
judgment gate.)

### Step 2: Server — add `GET /api/projects/:id/html`

Add a route that returns the project's HTML with the Step-1 image strategy
applied, as a downloadable file.

- Register a new regex, e.g.
  `const PROJECT_HTML_RE = /^\/api\/projects\/([a-f0-9-]+)\/html$/i;` next to
  the other `PROJECT_*_RE` constants in `apps/server/src/index.ts`.
- In `routeProjects`, match it for `GET` and call a new `serveProjectHtml(id, response)`.
- `serveProjectHtml`: read the project (404 if missing), apply the image
  strategy, then respond with headers:
  - `content-type: text/html; charset=utf-8`
  - `content-disposition: attachment; filename="<slug-or-id>.html"`
  - `cache-control: no-store` (generated content changes per edit)
- For option (A), put the image-inlining logic in `project-store.ts` as
  `getProjectHtmlInlined(id): Promise<string | null>` (reuse `readProjectImage`
  + `mediaTypeForName`; substitute via the same regex shape as
  `expandProjectImageUrls`). Keep it server-side so the client stays simple.

**Verify**: `pnpm --filter @workspace/server test -- --run project` → green,
including the new route test (Step 4).

### Step 3: Client — add the download trigger

- In `apps/client/src/lib/projects-api.ts`, add a helper that hits the new
  route. Simplest correct shape (server sets `content-disposition`, so a plain
  navigation triggers the download):
  ```ts
  export function downloadProjectHtml(id: string): void {
    window.location.href = `${SERVER_URL}/api/projects/${id}/html`
  }
  ```
  (If a future requirement needs a Blob/filename override, switch to
  `fetch` + `URL.createObjectURL` + an `<a download>` click — but the
  content-disposition route makes that unnecessary now.)
- In `packages/prompt-panel/src/prompt-panel.tsx`, add an `onDownloadHtml`
  callback prop and render a "Download HTML" action in the header next to
  `onAllProjects`/`onToggleTheme` (follow the existing button pattern in
  `PanelHeader`).
- In `apps/client/src/App.tsx`, pass `onDownloadHtml={() => downloadProjectHtml(projectId)}`.

**Verify**: `pnpm --filter @workspace/client typecheck && pnpm --filter @workspace/prompt-panel typecheck` → exit 0.

### Step 4: Tests

- Server: add a test (model after the existing project-route tests, e.g. in
  `apps/server/src/screenshot-response-route.test.ts` or a new
  `project-html-route.test.ts`) asserting: 404 for a missing project; 200 +
  `content-type: text/html` + `content-disposition: attachment` for a project
  with HTML; and (for option A) that an image reference in the HTML becomes a
  `data:` URL in the response body.
- Client/prompt-panel: no new automated test required for a navigation trigger;
  if you used the `fetch`+Blob variant instead, add a small test for the helper.

**Verify**: `pnpm --filter @workspace/server test -- --run` → all pass, server coverage gate still green.

### Step 5: Lint + format + full gate

**Verify**: run the four command rows in "Commands you will need" → all exit 0.

## Test plan

- New server test: `project-html-route` — missing project → 404; present → 200,
  `text/html`, `attachment` disposition; option-A image inlining → response
  body contains `data:image/`.
- Pattern after: `apps/server/src/screenshot-response-route.test.ts` (uses the
  in-process `server` + supertest-style requests against the real router).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `GET /api/projects/<existing-id>/html` returns 200, `content-type: text/html`, `content-disposition: attachment`
- [ ] `GET /api/projects/<missing-id>/html` returns 404
- [ ] (Option A) response body contains `data:image/` for a project whose HTML references an image
- [ ] `pnpm --filter @workspace/server test -- --run` exits 0, coverage gate green
- [ ] `pnpm --filter @workspace/client typecheck` and `@workspace/prompt-panel typecheck` exit 0
- [ ] `pnpm run lint && pnpm run format:check` exit 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row for 010 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any in-scope file no longer matches the excerpts/line refs in "Current state".
- Inlining images as data URLs turns out to balloon the response past a sane
  size (e.g. dozens of large generated images) — report and consider a
  per-request image count cap before continuing.
- The 90% server coverage gate cannot be kept green with the new route — report
  rather than weakening other tests to compensate.
- `window.location.href` download is blocked by the client's CSP/sandbox —
  switch to the `fetch`+Blob variant and note why.

## Maintenance notes

- If a future change alters how images are referenced in generated HTML (e.g.
  a new placeholder scheme), the server-side inlining regex in
  `getProjectHtmlInlined` must be updated in lockstep with
  `expandProjectImageUrls`.
- A reviewer should scrutinize: (1) the image-inlining substitution is
  total (every referenced image becomes `data:`), (2) the route is
  path-traversal-safe (reuse the existing `isSafeImageName` guard — do not
  invent a new one), (3) no base64 image bytes are logged.
- Deferred out of this plan: bulk export, export-without-images option, and a
  "copy HTML to clipboard" affordance — note as follow-ups if requested.
