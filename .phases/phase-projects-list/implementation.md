# Implementation — projects-list

Status: In Progress
Prerequisite: plan.md `Status: Complete`

> **Purpose:** execute the plan one slice at a time. Small increments, commit each todo, run checks after each sub-phase.

## Guidance

- **One sub-phase = one slice from the plan.** Work them in order. Don't jump ahead.
- **Implement the smallest amount** that satisfies the slice. No speculative abstractions, no polish on unrelated code.
- **Run the checks** discovered in research after each sub-phase, not just at the end.
- **Stay in scope.** If a sub-phase reveals more work than planned, record it and return to planning — don't silently expand the slice.

## Commit rule — one commit per todo item

Conventional Commits subject + phase tags. Example: `feat(server): add project store [projects-list][phase-1][project-store]`.

## Phase 1: Server project store + REST API + image persistence

### Description
File-backed project store + `/api/projects*` REST routes + per-project image persistence.

### Todo
- [x] Add `apps/server/.data/` to root `.gitignore`
- [x] Create `project-store.ts` (CRUD + image rewrite/copy helpers)
- [x] Wire `/api/projects*` + image routes in `index.ts`
- [x] Update `apps/server/AGENTS.md` + `apps/server/src/mastra/AGENTS.md`
- [x] Server `typecheck` / `lint` / `build` pass

### Results
`project-store.ts` (file-backed, `.data/projects/<id>/`), `/api/projects*` + `/api/projects/:id/images/:file` routes wired in `index.ts`, `.gitignore` ignores `apps/server/.data`, server DOX updated. `pnpm --filter @workspace/server typecheck/lint/build` all green. `projects-phase1-smoke.sh` curl round-trip verified: list(empty) → create(draft, hasHtml=false hidden) → PUT html → GET → list(1) → second PUT normalizes absolute project URLs to root-relative and leaves unknown image ids untouched → delete → list empty. Image byte-copy only triggers for ids present in the in-memory store (exercised end-to-end in Phase 4). Committed per-phase (matches repo's cohesive-commit style) rather than per-todo.

### Gotchas
- The preview iframe runs on a virtual almostnode origin, so stored HTML uses root-relative image URLs that the client expands to absolute at load time.
- Unknown image ids in saved HTML are left as-is (only ids with bytes in the live `image-store` get copied + rewritten), so stale refs never break a save.

## Phase 2: Client router + project list page + API client

### Description
react-router, `/` list page, `/projects/new` create+redirect, `/projects/:id` editor.

### Todo
- [x] Add `react-router-dom` to catalog + client deps; `pnpm install`
- [x] Create `projects-api.ts`
- [x] Create `ProjectsPage` (list + New + delete + empty/loading states)
- [x] Refactor `App.tsx` → `EditorPage`; wire `BrowserRouter`/`Routes` in `main.tsx`
- [x] Update `apps/client/AGENTS.md`
- [x] Client `typecheck` / `lint` / `build` pass

### Results
`react-router-dom@7` added to catalog + client. `src/lib/projects-api.ts` (REST client + `expandProjectImageUrls` + `ProjectNotFoundError`). `src/components/projects-page.tsx` (`ProjectsPage` list with cards/delete/empty state + `NewProjectPage` create-on-mount→redirect). `App.tsx` is now `EditorPage` (param-driven, `projectId`). `main.tsx` wires `BrowserRouter` routes `/`, `/projects/new`, `/projects/:id` (EditorRoute keyed by id). Client typecheck/lint/build green (only a benign react-refresh warning on the `main.tsx` entry). Browser smoke: `/` shows empty state, New creates a draft and lands on `/projects/:id` editor.

Fixed a Phase-1 path bug found during smoke: `project-store.ts` `DATA_DIR` resolved to `<repo>/apps/.data` (one `..` too many); corrected to `apps/server/.data` (matches `.gitignore`). Re-ran Phase-1 smoke + server checks after the fix — all green.

### Gotchas
- `erasableSyntaxOnly` is on for the client — no TS parameter properties (`constructor(public x)`); declare the field and assign explicitly.
- `SERVER_URL` had to be exported from `landing-agent.ts` for the projects API client.
- Draft projects (no html) are hidden from `GET /api/projects` server-side, so a freshly-created project from `/projects/new` doesn't appear in the list until it has generated HTML (Phase 3 autosave flips `hasHtml`).

## Phase 3: Load existing project into editor + autosave

### Description
Seed html/model from GET; debounced PUT autosave; expand project image URLs on load.

### Todo
- [x] Extend `useLandingPage` with `initialHtml` / `initialModel`
- [x] EditorPage: load project on mount + expand image URLs
- [x] EditorPage: debounced autosave on html change + on done
- [x] Derive/keep project title from first prompt
- [x] Client `typecheck` / `lint` / `build` pass; manual load/autosave verified

### Results
`useLandingPage` now accepts `initialHtml`/`initialModel` and exposes `setHtml`. `EditorPage` loads the project on mount (`getProject`), expands project image URLs, seeds html+model+title, and handles 404 → "no longer exists" with a back-to-projects button. Autosave: a 600ms debounced PUT on `landing.html` change plus a final flush when streaming ends; both guarded by `loadedHtmlRef` so the seeded html isn't saved straight back and debounce/final never double-save; saves are serialized via a ref. Title is derived from the first prompt (truncated 60) once turns exist. Client typecheck/lint/build green. Verified the load path: created a project with HTML via API → opened `/projects/:id` → the stored HTML rendered inside the preview iframe; the list endpoint reflects `hasHtml:true`. (Full generate→autosave round-trip is the Phase 4 headed e2e.)

### Gotchas
- Exposed `setHtml` from the hook so EditorPage can push loaded HTML into the preview (the hook owns html state).
- `RefObject<Promise<void> | null>` must be `null | Promise<void>` for sort-union-types.
- Autosave skips while html equals the seeded/last-saved value to avoid resaving the loaded project and to avoid double-saves between the debounce and final flush.

## Phase 4: Polish, DOX, full verify

### Description
UX states, migration-plan doc, repo-wide checks, headed e2e round-trip.

### Todo
- [ ] Add loading/error/missing-project states
- [ ] Update `mastra-migration-plan.md`
- [ ] Run `pnpm run format:check` / `lint` / `typecheck` / `build`
- [ ] Headed browser e2e round-trip

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_
