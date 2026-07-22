# Plan 006: Fix the stale `request('close')` comment in `route.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/route.ts`
> If the file changed since this plan was written, locate the
> `activeRuns`-related JSDoc by content (the comment text below is unique
> enough to find even if line numbers shifted); on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs (stale comment correction)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/route.ts` has a JSDoc above the `activeRuns` map
that claims a `request('close')` listener aborts the run when a client
disconnects. No such listener exists — `grep -nE "request\.on|request\.once|'close'|'aborted'" apps/server/src/mastra/route.ts` returns zero matches. The
actual behavior (per `apps/server/AGENTS.md` "Run lifetime" section) is
that a client disconnect is **delivery loss, not cancellation**: accepted
runs continue to terminal persistence in the same server process, and
`POST /api/projects/:id/stop` is the authoritative stop. The misleading
comment makes the run-lifecycle code harder to maintain — a future editor
could waste time looking for the non-existent listener or, worse, add one
that breaks the documented "stop is authoritative" contract.

## Current state

The JSDoc lives directly above `const activeRuns = new Map<string,
AbortController>()` in `apps/server/src/mastra/route.ts` (around line
159-167 at commit `5daf56ef`). Verbatim:

```ts
/**
 * Active landing-agent runs keyed by projectId. A graceful stop (see
 * `stopLandingAgent`) aborts the run's Mastra stream WITHOUT closing the SSE
 * response, so the run still flushes its terminal cost/stats before `done` and
 * the client can show what a stopped run spent. A client disconnect still
 * aborts via the `request('close')` listener as a fallback. The map is mutated
 * only inside `streamLandingAgent` (register on start, conditional delete in
 * `finally`).
 */
const activeRuns = new Map<string, AbortController>()
```

The wrong sentence is:
> A client disconnect still aborts via the `request('close')` listener as a fallback.

Authoritative source-of-truth (from `apps/server/AGENTS.md` "Local
Contracts" → "Run lifetime"):

> Run lifetime: browser/SSE request closure = delivery loss, not
> cancellation. Explicit `POST /api/projects/:id/stop` remains
> authoritative. Accepted runs continue to terminal persistence in same
> server process after client disconnect; process restart + multi-process
> durability out of scope.

### Repo conventions to match

- This is a JSDoc comment — no code change, no test impact.
- Match the surrounding comment's tone (declarative, references
  end-points by path).

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0 (no code change) |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; same count as baseline |

(All three are smoke checks — a comment-only change cannot break them, but
running them guards against accidental edits.)

## Scope

**In scope** (the only file you should modify):
- `apps/server/src/mastra/route.ts` — replace the misleading sentence in
  the `activeRuns` JSDoc.

**Out of scope** (do NOT touch):
- Any code in `route.ts` — this is a comment-only change.
- `apps/server/AGENTS.md` — it is already correct.
- `apps/server/src/mastra/AGENTS.md` — it is already correct.
- Other JSDoc blocks in `route.ts`.

## Git workflow

- Branch: `advisor/006-fix-stale-disconnect-comment`.
- Commit message style (match repo): e.g.
  `docs(server): correct stale request-close fallback comment in route.ts`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the misleading sentence

In `apps/server/src/mastra/route.ts`, find the JSDoc above `const
activeRuns = new Map<string, AbortController>()`. Replace this sentence:

> A client disconnect still aborts via the `request('close')` listener as a fallback.

with:

> A client disconnect (browser/SSE closure) does NOT abort the run — it is
> treated as delivery loss, not cancellation. Explicit
> `POST /api/projects/:id/stop` is the authoritative stop path; accepted
> runs continue to terminal persistence after a client disconnects.

Leave the rest of the JSDoc (the parts about graceful stop flushing
terminal stats, and the map-mutation contract) unchanged.

The final JSDoc should read:

```ts
/**
 * Active landing-agent runs keyed by projectId. A graceful stop (see
 * `stopLandingAgent`) aborts the run's Mastra stream WITHOUT closing the SSE
 * response, so the run still flushes its terminal cost/stats before `done` and
 * the client can show what a stopped run spent. A client disconnect (browser/SSE
 * closure) does NOT abort the run — it is treated as delivery loss, not
 * cancellation. Explicit `POST /api/projects/:id/stop` is the authoritative
 * stop path; accepted runs continue to terminal persistence after a client
 * disconnects. The map is mutated only inside `streamLandingAgent` (register
 * on start, conditional delete in `finally`).
 */
const activeRuns = new Map<string, AbortController>()
```

**Verify**: `grep -nE "request\('close'\)|request-on close listener" apps/server/src/mastra/route.ts`
→ no matches (the stale phrase is gone).

### Step 2: Smoke checks

**Verify** (all must pass — they are smoke checks, not behavior tests):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0; **same test count** as
  baseline (a comment change cannot add or remove tests).

### Step 3: Confirm scope

**Verify**: `git status --short` lists ONLY
`apps/server/src/mastra/route.ts`. `git diff` shows comment-only changes
(no `+`/`-` lines outside the JSDoc block).

## Test plan

None required. Comment-only change; the existing `route.test.ts` suite is
the smoke regression net and stays unchanged.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0 with the **same test
      count** as baseline
- [ ] `grep -nE "request\('close'\)|request-on close listener" apps/server/src/mastra/route.ts`
      returns no matches
- [ ] `git diff` shows ONLY JSDoc text changes (no executable code line
      changed)
- [ ] `git status --short` lists ONLY `apps/server/src/mastra/route.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the `activeRuns` JSDoc no longer
  matches the excerpt (someone reworked the lifecycle comments since
  planning). Re-locate the comment by searching for `activeRuns` and
  re-confirm the misleading sentence still exists before proceeding.
- A `request('close')` listener DOES exist somewhere in the server source
  (re-run `grep -rnE "request\.on\(.{1,5}close|request\.once" apps/server/src --include="*.ts"`
  to double-check). If it exists, the comment is correct and this plan is
  obsolete — STOP and report.
- `lint` complains about line length on the new comment text (it
  shouldn't — the lines are under the project's typical limit — but if
  it does, rewrap to stay under the limit while keeping all the
  substance).

## Maintenance notes

- After this lands, the run-lifecycle JSDoc matches the actual code and
  the `apps/server/AGENTS.md` "Run lifetime" contract. Future editors
  won't be sent looking for a non-existent listener.
- Anyone adding a real client-disconnect abort in the future MUST update
  BOTH this comment AND `apps/server/AGENTS.md` "Run lifetime" — they
  must agree.
- Reviewer: the diff should be comment-only. Reject any change to
  executable code.
