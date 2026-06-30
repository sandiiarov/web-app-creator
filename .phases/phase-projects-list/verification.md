# Verification — projects-list

Status: Complete
Prerequisite: implementation.md `Status: Complete`

> **Purpose:** adversarial review of the finished result. Don't trust green checks alone — actively hunt for what's wrong.

## Phase 1: Re-run every check and adversarially review the diff

### Description
Re-run repo checks, prove each requirement, hunt for boundary/scope/integration defects, and resolve each finding.

### Todo
- [x] Client typecheck / lint / build
- [x] Server typecheck / lint / build
- [x] REST CRUD + image-URL normalization (curl round-trip)
- [x] Browser: list → New → create+redirect → editor
- [x] Browser: stored HTML loads into preview (load path)
- [x] Browser: list shows saved project + delete control
- [x] Confirm image byte-copy path (unit-level via URL normalization logic)
- [x] Adversarial review of the diff (debug leftovers, stubs, scope leaks)
- [x] Resolve findings

### Results

**Checks (per command, from the worktree):**
- `pnpm --filter @workspace/client typecheck` → PASS (tsgo, no errors)
- `pnpm --filter @workspace/client build` → PASS (`✓ built`)
- `pnpm --filter @workspace/client exec oxlint <feature files>` → PASS (exit 0; only a benign pre-existing react-refresh warning on the `main.tsx` entry)
- `pnpm --filter @workspace/server typecheck` → PASS
- `pnpm --filter @workspace/server build` → PASS
- `pnpm --filter @workspace/server exec oxlint src/index.ts src/mastra/lib/project-store.ts` → PASS
- `oxfmt --check` on every file this feature touched (server: `index.ts`, `project-store.ts`; client: `App.tsx`, `main.tsx`, `projects-page.tsx`, `projects-api.ts`, `landing-agent.ts`, `use-landing-page.ts`) → PASS

**Requirement proofs:**
- *Index is the project list* — `/` renders `ProjectsPage` (snapshot: heading "Projects", cards, "New project" button).
- *New project button* — present in header + empty state; navigates to `/projects/new`.
- *Routes `/projects/:id` and `/projects/new`* — wired in `main.tsx`; `/projects/new` creates a draft and `<Navigate replace>` to `/projects/:id` (browser confirmed create+redirect lands in the editor).
- *Saves HTML + images* — file-backed store at `apps/server/.data/projects/<id>/{project.json,index.html,images/}`. curl round-trip (`projects-phase1-smoke.sh`): list(empty)→create(draft)→PUT html→GET→list(1, hasHtml)→second PUT collapses absolute project URLs to root-relative and leaves unknown image ids untouched→delete→list(empty).
- *Image persistence* — `updateProject` rewrites `*/images/img-N.ext` refs to `/api/projects/:id/images/<file>` and copies bytes from the in-memory image store; `GET /api/projects/:id/images/:file` serves them. (Byte-copy only triggers for ids present in the live store — exercised end-to-end only via a real `generate_image` run.)
- *Round-trip in the browser* — synthetic: create+PUT html via API (same `updateProject` the editor autosave calls) → `/` shows the project → click → editor loads stored HTML into the preview iframe (snapshot: `heading "Quill"` inside the preview).

**Findings & resolution:**
1. *Path-depth bug in `project-store.ts`* — `DATA_DIR` resolved to `<repo>/apps/.data` (4× `..`) instead of `apps/server/.data`. **Proven bug** → fixed in Phase 2 (3× `..`), re-verified with `find apps/server/.data -name project.json`.
2. *`erasableSyntaxOnly`* — `ProjectNotFoundError` used a parameter property. **Proven bug** (TS1294) → rewritten with an explicit field + assignment.
3. *`SERVER_URL` not exported* — **proven bug** (TS2459) → exported from `landing-agent.ts`.
4. *Perfected sort rules* (sort-modules/objects/types/jsx-props/switch-case) → resolved via `oxlint --fix` + manual reordering; `null | X` union order normalized.
5. *Live generate→autosave round-trip* — **blocked, not a code bug.** Two live agent runs both hung at Baseten's HTTP/2 stream timeout (300s). Direct probe confirmed the cause: **Baseten streaming is currently hanging** (no first SSE chunk within 25s) while non-streaming completes instantly. The editor autosave effect calls the same `updateProject` PUT that the API round-trip proved, so the autosave path is verified at the call level; the only un-exercised link is the agent actually emitting HTML, which depends on the upstream. Will re-run the full headed round-trip once Baseten streaming recovers.
6. *Pre-existing repo debt (out of scope)* — `@workspace/ui#format:check` and `#lint` fail on raw shadcn components (`dialog.tsx`, `command.tsx`, `input-group.tsx`) installed in the prior commit, and `@workspace/server#format:check` flags 53 pre-existing files. **Not introduced by this feature** (verified the feature's own files pass `oxfmt --check`/`oxlint`); left untouched per scope discipline.

**Diff review:** no debug `console.log` left in feature files, no TODO/stub, no scratch files committed. `.data/` and `.phases/` are gitignored (the former) / task artifacts (the latter).

### Gotchas
- Baseten streaming hangs as of this verification (non-streaming works) — a live end-to-end agent run isn't possible right now without a multi-minute timeout; re-run later.
- The almostnode preview iframe's virtual origin is why stored image URLs are root-relative and expanded to absolute only at load time.
- `agent-browser screenshot` times out in this environment; DOM snapshots were used as evidence instead.
