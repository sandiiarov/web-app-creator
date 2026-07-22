# Plan 003: Bound the `turnCache` Map with `LRUCache`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/server/src/mastra/lib/project-store.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plans 001, 002, but operates on the
  same file — see Git workflow for sequencing guidance)
- **Category**: perf (memory leak)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/lib/project-store.ts` caches the replayed/legacy
message turns for `getProject` in a module-scoped `Map`:

```ts
const turnCache = new Map<string, ProjectMessageTurn[]>()
```

The cache is invalidated on every write to a project (via
`invalidateTurnCache`) and on `deleteProject`, but there is **no capacity
bound**. Steady-state streaming invalidates only the active project's
entry; every project ever viewed retains an entry holding its full
`ProjectMessageTurn[]` array. A long-lived server accumulates entries
indefinitely — classic unbounded Map leak. The catalog already pins
`lru-cache@^11.5.1` (it's a declared `@workspace/server` dependency in
`apps/server/package.json`), so bounding the cache is a one-line swap with
no new dep.

## Current state

In `apps/server/src/mastra/lib/project-store.ts` (~line 496):

```ts
/** In-memory cache of the replayed/legacy message turns for `getProject`, so a
 *  reload doesn't re-read + re-replay the whole client log on every call.
 *  Invalidated whenever the client log or legacy messages.json changes. */
const turnCache = new Map<string, ProjectMessageTurn[]>()
```

Used in three places, all API-compatible with `LRUCache`:

- `getProject` (~line 257): `let messages = turnCache.get(id)` …
  `turnCache.set(id, messages)` — `LRUCache.get`/`.set` have the same call
  signature for this use (`get` returns `V | undefined`; `set` takes
  `(K, V)`).
- `invalidateTurnCache` (~line 686): `turnCache.delete(id)` — `LRUCache`
  has `.delete(k): boolean` (returns whether the entry existed; the
  existing call site discards the return value, so the slight difference
  in return type vs `Map.delete` is harmless).
- `deleteProject` calls `invalidateTurnCache` indirectly.

No callers use iteration (`keys`, `values`, `entries`, `forEach`) — only
`get`/`set`/`delete`. The swap is therefore API-complete.

### Repo conventions to match

- `lru-cache` is already listed in `apps/server/package.json`
  `"dependencies"` (`"lru-cache": "catalog:"`) — no manifest change
  needed.
- `import { LRUCache } from 'lru-cache'` is the standard named export for
  v11 (verified against the catalog pin during recon). Add it to the
  existing runtime-import block at the top of `project-store.ts`, sorted
  per Oxlint's perfectionist rules (the file uses `oxlint --fix` to
  enforce ordering — run lint:fix after editing).
- The module's existing const declarations follow `UPPER_SNAKE_CASE` for
  tuning constants (e.g. `MAX_SCREENSHOTS_PER_PROJECT`); match that for
  the new max-size constant.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Focused    | `pnpm --filter @workspace/server test -- --run project-store 2>&1 \| tail -15` | project-store tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/project-store.ts` — swap `Map` for `LRUCache`
  with a bounded `max`; add the import; add the size constant.

**Out of scope** (do NOT touch):
- `apps/server/package.json` — `lru-cache` is already a dep.
- `pnpm-workspace.yaml` — catalog entry already present.
- `getProject`, `invalidateTurnCache`, `deleteProject` behavior — the
  contract (invalidate on write/delete) must not change. Only the storage
  primitive swaps.
- Test files — the existing `'getProject reflects new client-log appends
  (turn cache invalidates)'` test (~line 578 of `project-store.test.ts`)
  is the regression net; it stays unchanged. (If you want to add an
  explicit eviction test, see "Test plan" — it's optional.)
- DOX — no behavioral contract changes.

## Git workflow

- Branch: `advisor/003-bound-turn-cache`.
- Commit message style (match repo): e.g.
  `fix(server): bound the getProject turn cache with LRU eviction`
- Do NOT push or open a PR unless the operator instructed it.
- **Sequencing**: if plans 001, 002, or 009 are also being executed in
  worktrees off the same base, this plan touches the same file
  (`project-store.ts`) — they MUST run in separate worktrees branched from
  the same SHA, and be merged one at a time. The conflicts are
  mechanical (different sections of the file).

## Steps

### Step 1: Add the import and size constant

In `apps/server/src/mastra/lib/project-store.ts`:

1. Add `import { LRUCache } from 'lru-cache'` to the runtime-import block
   at the top of the file. Run `pnpm --filter @workspace/server lint:fix`
   after the edit so `perfectionist/sort-imports` places it correctly.
2. Add a tuning constant next to `MAX_SCREENSHOTS_PER_PROJECT` (search for
   that name to find the right spot):
   ```ts
   /** Upper bound on the number of projects whose replayed turn cache is
    *  held in memory. Long-lived servers see one entry per recently-viewed
    *  project; LRU evicts the least-recently-used when the bound is hit. */
   const TURN_CACHE_MAX_PROJECTS = 64
   ```

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0 (the new
import resolves; the constant is unused but valid).

### Step 2: Swap `Map` for `LRUCache`

Replace the `turnCache` declaration:

```ts
const turnCache = new LRUCache<string, ProjectMessageTurn[]>({
  max: TURN_CACHE_MAX_PROJECTS,
})
```

Update the leading JSDoc to mention the bound — change the existing
comment's last sentence from
> Invalidated whenever the client log or legacy messages.json changes.

to
> Invalidated whenever the client log or legacy messages.json changes;
> bounded to `TURN_CACHE_MAX_PROJECTS` entries via LRU eviction so a
> long-lived server doesn't accumulate one entry per project ever viewed.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0. If
typecheck complains that `LRUCache` is not exported, double-check the
catalog resolved version (`node -p "require('lru-cache/package.json').version"`);
on v11+ the named export is `LRUCache`. If for some reason the resolved
version is older, STOP and report — the API may differ.

### Step 3: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0. (Run `lint:fix` if
  perfectionist complains about import or const placement.)
- `pnpm --filter @workspace/server test` → exit 0; **same test count** as
  baseline; coverage ≥ 90%. The
  `'getProject reflects new client-log appends (turn cache invalidates)'`
  test must still pass — that proves invalidation semantics survived the
  swap.

### Step 4: Confirm scope

**Verify**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/lib/project-store.ts`
shows the file modified; `git status --short` lists ONLY that file.

## Test plan

This is a **storage-primitive swap** — the existing cache-invalidation
test is the regression net and stays unchanged. No new test required.

OPTIONAL follow-up (explicitly deferred, out of scope): a dedicated
eviction test would set `TURN_CACHE_MAX_PROJECTS` very low (e.g. expose
it via env override or test-only setter), insert N+1 entries via
`getProject`, and assert the first entry was evicted. Skipping this — the
LRU library is well-tested and the API swap is mechanical; an eviction
test would mostly re-test the library. If a reviewer insists, add it as a
follow-up, but it is not required for this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0 with the **same test
      count** as baseline; coverage ≥ 90%
- [ ] `grep -nE 'new Map<string, ProjectMessageTurn' apps/server/src/mastra/lib/project-store.ts`
      returns no matches
- [ ] `grep -nE "new LRUCache<string, ProjectMessageTurn" apps/server/src/mastra/lib/project-store.ts`
      returns one match
- [ ] `git status --short` lists ONLY `apps/server/src/mastra/lib/project-store.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `LRUCache` is not exported by the resolved `lru-cache` version (the
  catalog pin is `^11.5.1` which should be fine — but if the version
  drifts, the named export or constructor signature could differ). Report
  the installed version and the import error.
- Any caller of `turnCache` uses a `Map`-only method that `LRUCache`
  doesn't have (the recon turned up only `get`/`set`/`delete`, but a
  future edit could have added `forEach`/`entries`/etc.). Report the
  caller and the missing method.
- The cache-invalidation test fails — that means `LRUCache.delete` is not
  dropping the entry (it should). Investigate before continuing.
- The drift check is non-empty AND the live `turnCache` declaration or
  its callers do not match the excerpts above.

## Maintenance notes

- After this lands, the turn cache is bounded to 64 entries. Long-lived
  servers serving many projects will see cold-cache replays on
  less-recently-used projects (one extra `readClientMessages` + replay
  per `getProject`). For the documented loopback single-tenant
  deployment, 64 is generous; raise `TURN_CACHE_MAX_PROJECTS` if a real
  workload shows replay churn.
- Do NOT remove `invalidateTurnCache` — it is still called on every
  write. LRU eviction is a safety net for inactive projects; the active
  invalidation path is unchanged.
- Reviewer: the diff should be one import, one constant, and one
  swapped `new Map(...)` → `new LRUCache(...)`. Reject any change to
  `getProject`, `invalidateTurnCache`, `deleteProject`, or the test
  file.
