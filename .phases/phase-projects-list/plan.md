# Plan — projects-list

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

## Resolved decisions (supersede research open-questions)

- **Eager create.** Entering `/projects/new` calls `POST /api/projects` immediately and redirects to `/projects/:id`. This keeps the route id stable for the whole editing session, so autosave is always `PUT` and there is no mid-stream navigation that would remount the editor and abort the agent stream. Draft projects (no `index.html` yet) are hidden from the list.
- **Saved per project:** `index.html` (string), locally-generated images (`generate_image` bytes), metadata `{ id, title, model, createdAt, updatedAt, hasHtml }`. Chat history (`turns`) is **not** persisted in v1.
- **Image URLs:** stored HTML uses root-relative `/api/projects/:id/images/<file>`; the client expands to absolute `${SERVER_URL}/api/projects/:id/images/<file>` when writing the loaded HTML into the preview VFS (because the preview iframe runs on a virtual origin). On `PUT`, the server rewrites any `*/images/img-N.ext` refs to project-relative and copies bytes from the in-memory image store into the project folder.
- **Title:** derived from the first user prompt (truncated); falls back to "Untitled".

## Phase 1: Server project store + REST API + image persistence

### Description
Files touched:
- new `apps/server/src/mastra/lib/project-store.ts`
- `apps/server/src/index.ts` (add routing)
- root `.gitignore` (ignore `apps/server/.data/`)
- `apps/server/src/mastra/AGENTS.md` + `apps/server/AGENTS.md` (contract changes)

Approach:
- File-backed store under `apps/server/.data/projects/<id>/` with `project.json`, `index.html`, `images/<file>`. `id` = `crypto.randomUUID()`.
- Pure helpers: `listProjects()`, `getProject(id)`, `createProject({title,model})`, `updateProject(id,{title?,model?,indexHtml?})`, `deleteProject(id)`. List returns metadata only (no html). `getProject` returns metadata + `indexHtml`.
- On `updateProject` with `indexHtml`: parse for `https?://<host>/images/(img-\d+)(\.\w+)?` and `/images/(img-\d+)...`, look each up in the existing in-memory `getImage()`, write bytes to `images/<id>.<ext>`, and rewrite those URLs to root-relative `/api/projects/:id/images/<id>.<ext>`. Unknown ids are left untouched.
- Endpoints in `routeRequest` (raw handlers, reuse `sendJson`/`readJson`/`readRequestBody`):
  - `GET  /api/projects` → `listProjects()` (filtered: `hasHtml === true`)
  - `POST /api/projects` body `{title?,model?}` → `createProject` → full project
  - `GET  /api/projects/:id` → `getProject` (404 if missing)
  - `PUT  /api/projects/:id` body `{title?,model?,indexHtml?}` → `updateProject`
  - `DELETE /api/projects/:id` → `deleteProject`
  - `GET  /api/projects/:id/images/:file` → stream persisted bytes (content-type from extension)
- Reuse existing CORS headers (already global) and the direct-run listen guard.

Acceptance:
- Server `typecheck`, `lint`, `build` pass.
- `curl` CRUD works against `http://localhost:3001/api/projects` (create, get, update with html containing an in-memory image ref, list, delete, image fetch).

### Todo
- [ ] Add `.data/` to `.gitignore`
- [ ] Create `project-store.ts` with CRUD + image rewrite/copy helpers
- [ ] Wire `/api/projects*` and `/api/projects/:id/images/:file` routes in `index.ts`
- [ ] Update `apps/server/AGENTS.md` + `apps/server/src/mastra/AGENTS.md` (routes + persistence contract)
- [ ] Server `typecheck` / `lint` / `build` pass

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 2: Client router + project list page + API client

### Description
Files touched:
- `pnpm-workspace.yaml` + `apps/client/package.json` (add `react-router-dom` catalog)
- `apps/client/src/main.tsx` (BrowserRouter + Routes)
- new `apps/client/src/lib/projects-api.ts`
- new `apps/client/src/components/projects-page.tsx`
- refactor `apps/client/src/App.tsx` → param-driven `EditorPage`
- `apps/client/AGENTS.md` (new routes/components)

Approach:
- Routes: `/` → `<ProjectsPage/>`; `/projects/new` → `POST` create then `<Navigate replace to="/projects/:id">`; `/projects/:id` → `<EditorPage/>`.
- `projects-api.ts`: thin fetch wrappers over `/api/projects` using `SERVER_URL` from `landing-agent.ts`.
- `ProjectsPage`: fetch list on mount, render cards (title + relative date), "New project" button (navigates to `/projects/new`), delete action, loading/empty states. Reuse shadcn `Button`, lucide icons, square visual language (no rounded corners).
- `EditorPage` = current `App` body, taking `projectId` from `useParams`. Render only when `projectId` present (the `/projects/new` route does the create+redirect).

Acceptance:
- `pnpm install` resolves; client `typecheck` / `lint` / `build` pass.
- `/` shows list (empty state initially); clicking New creates a project server-side and lands on `/projects/:id` with the editor.

### Todo
- [ ] Add `react-router-dom` to catalog + client deps; `pnpm install`
- [ ] Create `projects-api.ts`
- [ ] Create `ProjectsPage` (list + New + delete + empty state)
- [ ] Refactor `App.tsx` → `EditorPage`; wire `BrowserRouter`/`Routes` in `main.tsx`; `/projects/new` create+redirect
- [ ] Update `apps/client/AGENTS.md`
- [ ] Client `typecheck` / `lint` / `build` pass

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Load existing project into editor + autosave

### Description
Files touched:
- `apps/client/src/hooks/use-landing-page.ts` (accept initial html/model; keep existing stream logic)
- `apps/client/src/components/App.tsx` (EditorPage: load + autosave)
- `apps/client/src/lib/projects-api.ts` (expand project image URLs helper)

Approach:
- `useLandingPage({ onError, onHtml, initialHtml, initialModel })`: seed `useState(initialHtml)` / `useState(initialModel ?? default)`.
- `EditorPage`: on mount, if route `id`, `GET /api/projects/:id`, expand `/api/projects/:id/images/<file>` → absolute, seed hook html/model; remember `title`.
- Autosave: debounced (600ms) `PUT /api/projects/:id { title, model, indexHtml }` whenever `landing.html` is non-empty; also flush on `done`. Title = first turn's prompt (truncated) or existing title.
- Keep `PromptPanel`/preview exactly as-is; EditorPage keyed by route id so switching projects resets cleanly (no remount during a run because the id is stable per session).
- List page hides drafts (`hasHtml === false` already filtered server-side in Phase 1).

Acceptance:
- Generate a landing page → it autosaves; reload `/` → it appears in the list → open it → HTML + generated images render in the preview.

### Todo
- [ ] Extend `useLandingPage` with `initialHtml` / `initialModel`
- [ ] EditorPage: load project on mount + expand image URLs
- [ ] EditorPage: debounced autosave on html change + on done
- [ ] Derive/keep project title from first prompt
- [ ] Client `typecheck` / `lint` / `build` pass; manual load/autosave verified

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 4: Polish, DOX, full verify

### Description
Files touched: list/editor UX, remaining DOX (client/server/mastra), and the migration plan.

Approach:
- Loading/error states on list + editor; safe handling of deleted/missing project (404 → back to list); delete confirmation.
- Update `mastra-migration-plan.md` with the projects/persistence addition.
- Run repo-wide `format:check`, `lint`, `typecheck`, `build`, plus a headed browser e2e covering: list → New → prompt → autosave → reload → reopen.

Acceptance:
- All repo checks green; browser e2e shows the full round-trip.

### Todo
- [ ] Add loading/error/missing-project states
- [ ] Update `mastra-migration-plan.md`
- [ ] Run `pnpm run format:check` / `lint` / `typecheck` / `build`
- [ ] Headed browser e2e round-trip

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_
