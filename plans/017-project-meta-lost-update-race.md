# Plan 017: Close the lost-update race on `project.json` between the model PATCH and edits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c305fd0b..HEAD -- apps/server/src/mastra/lib/project-store.ts`
> If this file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `c305fd0b`, 2026-07-09
- **Issue**: _(omit — not published via `--issues`)_

## Why this matters

`project.json` is read-modify-written by two uncoordinated code paths:

- **`markHasHtmlSync`** (sync RMW) — runs on every successful `edit`, via
  `createProjectHtmlStore().set()` → `persistRenderedDocument`.
- **`updateProjectModel`** (async RMW, from `PATCH /api/projects/:id`) — runs
  whenever the user changes the model dropdown mid-session.

`updateProjectModel` reads meta with `await readMeta(id)` (yields), builds
`next`, then `await writeMeta(id, next)` (yields again). If a successful edit
lands between that read and write — `markHasHtmlSync` flips `hasHtml: true`
synchronously — `updateProjectModel` resumes and writes its `next`, which was
built from the **stale** pre-edit snapshot, reverting `hasHtml` back to `false`.

Concrete user-visible impact when a model-dropdown change overlaps an editing
run (the dropdown is always interactive, edits happen frequently — so this is
reachable, not theoretical):

1. The project **vanishes from the project list** (`handleListProjects` filters
   `project.hasHtml`; drafts with no HTML are hidden).
2. If the run ends in that window, the **empty-draft guard misfires**
   (`route.ts`: `if (!fatalRunError && !project.hasHtml && htmlUpdateSequence === 0)`
   emits a terminal `error` "Agent finished without generating project HTML"
   even though HTML exists).

It self-heals on the next successful edit (which calls `markHasHtmlSync`
again), but until then the list is wrong and the next run can error spuriously.

### The fix

Make `updateProjectModel`'s read-modify-write **fully synchronous** — read with
`readMetaSync`, write with `writeMetaSync`, with no `await` between them. Every
other `project.json` writer (`markHasHtmlSync`, `setTitleIfUntitled`,
`writeMetaSync`-based store updates) is already synchronous, and Node's
single-threaded event loop serializes synchronous RMW sequences — they cannot
interleave. This closes the race with no lock and no change to the
load-bearing sync HTML-store path. The function stays `async` (callers `await`
it); it simply no longer yields mid-RMW.

## Current state

### `apps/server/src/mastra/lib/project-store.ts` — the racy function

```ts
/** Persist the current model selection for a project. */
export async function updateProjectModel(
  id: string,
  model: string,
): Promise<null | ProjectMeta> {
  const meta = await readMeta(id)
  if (!meta) return null

  const normalized = model.trim()
  if (meta.model === normalized) return meta

  const next = {
    ...meta,
    model: normalized,
    updatedAt: new Date().toISOString(),
  }
  await writeMeta(id, next)
  return next
}
```

### The sync sibling writers it races against (same file)

```ts
function markHasHtmlSync(id: string) {
  const meta = readMetaSync(id)
  if (!meta) return
  meta.hasHtml = true
  meta.updatedAt = new Date().toISOString()
  writeMetaSync(id, meta)
}

export function setTitleIfUntitled(id: string, title: string): void {
  const meta = readMetaSync(id)
  if (!meta || meta.title !== 'Untitled') return
  meta.title = truncateTitle(title)
  meta.updatedAt = new Date().toISOString()
  writeMetaSync(id, meta)
}
```

### The sync helpers already exist and are safe to reuse

```ts
function readMetaSync(id: string): null | ProjectMeta {
  try {
    const raw = readFileSync(join(projectDir(id), PROJECT_JSON), 'utf8')
    return JSON.parse(raw) as ProjectMeta
  } catch {
    return null
  }
}

function writeMetaSync(id: string, meta: ProjectMeta) {
  mkdirSync(projectDir(id), { recursive: true })
  writeFileSync(join(projectDir(id), PROJECT_JSON), JSON.stringify(meta, null, 2), 'utf8')
}
```

`writeMetaSync` already `mkdirSync`s the project dir, so no `ensureProjectDir`
await is needed. `markHasHtmlSync` is invoked from `createProjectHtmlStore`'s
`persistRenderedDocument`, which itself is called from the sync store `set()`
path inside `edit` tool execution (the comment: "Sync so the write is complete
before Mastra emits the edit tool-result — no race"). That invariant is about
the **HTML** write (`writeHtmlDocumentSync`), which is untouched here.

### Caller — `apps/server/src/index.ts`

```ts
async function handlePatchProject(id, request, response) {
  // ... validates body.textModel ...
  const project = await updateProjectModel(id, resolveModelId(body.textModel))
  if (!project) { sendJson(response, 404, ...); return }
  sendJson(response, 200, { ok: true, project })
}
```

`await`ing a function whose body is now synchronous is a no-op for the caller —
the returned `ProjectMeta` is identical. No caller change required.

### Repo conventions to match

- Sync fs helpers (`*Sync`) are the established pattern for the write-through
  store path; `readMetaSync`/`writeMetaSync` already exist and are used by
  `markHasHtmlSync`/`setTitleIfUntitled`. This change makes `updateProjectModel`
  consistent with them.
- The server enforces 90% line coverage. Match the existing test style in
  `project-store.test.ts` (real temp project dirs via `createProject`, then
  assertions on returned meta / on-disk JSON).

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                                | exit 0              |
| Typecheck | `pnpm run typecheck`                                          | exit 0, no errors   |
| Lint      | `pnpm run lint`                                               | exit 0              |
| Format    | `pnpm run format:check`                                       | exit 0              |
| Tests     | `pnpm run test`                                               | all pass            |
| Focused   | `pnpm --filter @workspace/server test -- --run project-store` | all pass            |

## Scope

**In scope** (the only files you should modify):

- `apps/server/src/mastra/lib/project-store.ts` — make `updateProjectModel`'s RMW synchronous.
- `apps/server/src/mastra/lib/project-store.test.ts` — add a characterization test for the invariant.

**Out of scope** (do NOT touch, even though they look related):

- `markHasHtmlSync`, `setTitleIfUntitled`, `createProjectHtmlStore` — already correct (synchronous). Leave them.
- `writeMeta` / `readMeta` (the async helpers) — still used by `createProject` at creation (no race there; brand-new randomUUID, creation completes before any PATCH). Do not remove them.
- `apps/server/src/index.ts` — no caller change needed.
- Any change to the HTML store sync write path (`writeHtmlDocumentSync`) — it is load-bearing for edit-done ordering.

## Git workflow

- Branch: `advisor/017-project-meta-race`
- Conventional commits, e.g. `fix(project-store): make updateProjectModel RMW synchronous to close hasHtml lost-update race`. Match `git log` style (recent example: `fix(image-ocr): bound OCR fetch with timeout + retry [plan 013]`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `updateProjectModel` synchronous

Replace the async read+write with the synchronous helpers, keeping the function
signature `async` and the early-return / no-op-when-unchanged behavior identical:

```ts
/** Persist the current model selection for a project. */
export async function updateProjectModel(
  id: string,
  model: string,
): Promise<null | ProjectMeta> {
  const meta = readMetaSync(id)
  if (!meta) return null

  const normalized = model.trim()
  if (meta.model === normalized) return meta

  const next = {
    ...meta,
    model: normalized,
    updatedAt: new Date().toISOString(),
  }
  writeMetaSync(id, next)
  return next
}
```

Note: the `next` object spreads the **freshly-read** `meta`, so any field set by
a sibling sync writer that ran before this tick (e.g. `hasHtml` from a prior
edit, `title` from `setTitleIfUntitled`) is preserved. There is no `await`
between read and write, so no other code can interleave.

**Verify**:
- `pnpm run typecheck` → exit 0.
- `grep -n "await readMeta\|await writeMeta" apps/server/src/mastra/lib/project-store.ts` → shows `await readMeta` only inside `createProject`-adjacent code paths, **not** inside `updateProjectModel`. (Specifically: `updateProjectModel` must contain neither.)
- `pnpm --filter @workspace/server test -- --run project-store` → existing tests still pass.

### Step 2: Add a characterization test for the invariant

In `apps/server/src/mastra/lib/project-store.test.ts`, add a test proving that
fields set by the sync sibling writers survive a subsequent `updateProjectModel`
(fresh-read contract — this is what was broken when the read was a stale
async snapshot). Follow the existing test setup pattern in that file (create a
real project via `createProject`, then assert on returned meta / on-disk state).

Test: **"updateProjectModel preserves hasHtml and title set by sync writers"**

```ts
it('preserves hasHtml and title set by sync writers (no lost update)', async () => {
  const { id } = await createProject({ title: 'Untitled' })
  // Simulate a successful edit flipping hasHtml, and a title set from a prompt,
  // both via the synchronous writers updateProjectModel used to race against.
  const store = createProjectHtmlStore(id)
  store.set('<!doctype html><html><body><h1>Hi</h1></body></html>') // -> markHasHtmlSync
  setTitleIfUntitled(id, 'My Landing')

  // Now a model PATCH lands. It must read the latest meta (hasHtml true, titled),
  // not a stale snapshot, and preserve both.
  const updated = await updateProjectModel(id, 'some/model-id')

  expect(updated).toMatchObject({
    hasHtml: true,
    model: 'some/model-id',
    title: 'My Landing',
  })
  // And the on-disk file agrees (no reverted hasHtml):
  const onDisk = JSON.parse(
    await readFile(/* the project's project.json path */, 'utf8'),
  )
  expect(onDisk.hasHtml).toBe(true)
  expect(onDisk.title).toBe('My Landing')
  expect(onDisk.model).toBe('some/model-id')
})
```

Resolve the project.json path the same way existing tests in the file do (look
for how they read back `project.json` — likely via `getProject` or a joined path
under the data dir; mirror that exactly). If existing tests assert on-disk state
via `getProject(id)`, use that and assert `project.hasHtml === true &&
project.model === 'some/model-id'`.

**Verify**:
- `pnpm --filter @workspace/server test -- --run project-store` → the new test passes, and all existing tests still pass.
- `pnpm run test` → all pass (server 90% coverage gate holds).

## Test plan

- New test (Step 2): `updateProjectModel` preserves `hasHtml` + `title` set by the sync writers (`createProjectHtmlStore().set()` and `setTitleIfUntitled`). This characterizes the fresh-read contract that the async-snapshot implementation violated.
- Structural pattern: mirror an existing `project-store.test.ts` test that creates a project, mutates it, and reads back state.
- Why this is the right test (honest note for the reviewer): the original bug was an interleaving between an async RMW and a sync RMW — the fix removes the `await` window that enabled it. A truly concurrent interleaving is not deterministically reproducible against sync code, so the test guards the _contract_ (fresh read preserves sibling writes) plus the grep gate proves the window is gone. Both together are the machine-checkable signal.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `updateProjectModel` in `project-store.ts` contains **no** `await readMeta` and **no** `await writeMeta` (it uses `readMetaSync` + `writeMetaSync`).
- [ ] `pnpm run typecheck` exits 0.
- [ ] `pnpm run lint` exits 0.
- [ ] `pnpm run format:check` exits 0.
- [ ] `pnpm run test` exits 0; the new "preserves hasHtml and title" test exists and passes.
- [ ] No files outside the in-scope list are modified (`git status`).

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (e.g. `updateProjectModel` already uses `readMetaSync`, or `markHasHtmlSync`/`setTitleIfUntitled` signatures changed).
- `readMetaSync` / `writeMetaSync` no longer exist or no longer `mkdirSync` the project dir (the fix depends on `writeMetaSync` being self-contained).
- A step's verification fails twice after a reasonable fix attempt.
- You discover another async RMW on `project.json` beyond `updateProjectModel` and `createProject` (report it; do not expand scope without checking).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- The invariant this plan establishes: **every read-modify-write of an _existing_ project's `project.json` is synchronous.** `updateProjectModel` now joins `markHasHtmlSync`/`setTitleIfUntitled` in that contract. If a future change reintroduces an `await` between read and write in any of these, the race reopens — the grep gate in Done criteria is the guard.
- `writeMeta`/`readMeta` (async) remain for `createProject` (creation has no concurrent writer on a fresh randomUUID). If `createProject` ever gains a concurrent-writer risk, convert it too.
- A reviewer should confirm the returned `ProjectMeta` from `updateProjectModel` is unchanged in shape (it is — same object literal, just built from a sync read).
- The deeper "per-project write mutex" (a `chainProjectWrite`-style lock covering both sync and async writers) is intentionally _not_ introduced — the sync-RMW contract makes it unnecessary. Revisit only if a genuinely async meta writer is added and cannot be made synchronous.
