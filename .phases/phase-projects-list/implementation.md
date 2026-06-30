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
- [ ] Add `react-router-dom` to catalog + client deps; `pnpm install`
- [ ] Create `projects-api.ts`
- [ ] Create `ProjectsPage` (list + New + delete + empty/loading states)
- [ ] Refactor `App.tsx` → `EditorPage`; wire `BrowserRouter`/`Routes` in `main.tsx`
- [ ] Update `apps/client/AGENTS.md`
- [ ] Client `typecheck` / `lint` / `build` pass

### Results
_(fill at end of the sub-phase)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Load existing project into editor + autosave

### Description
Seed html/model from GET; debounced PUT autosave; expand project image URLs on load.

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
