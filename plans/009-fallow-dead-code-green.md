# Plan 009: Make the `fallow:dead-code` CI gate green again

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09236e63 -- apps/server/src/mastra/lib/anchor-edit/html-balance-guard.ts apps/server/src/mastra/lib/anchor-edit/dsl.ts apps/client/src/lib/landing-agent.ts apps/client/src/lib/sse-client.ts apps/server/package.json .fallowrc.jsonc`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tech-debt (CI gate red on main)
- **Planned at**: commit `09236e63`, 2026-08-02

## Why this matters

The CI workflow (`.github/workflows/ci.yml`) runs `pnpm run fallow:dead-code`
as a gate, and it currently **fails on main** (exit 1): 5 unused exports +
3 unused dependencies. Every push and PR is red until this is resolved, which
also trains everyone to ignore the gate. The fixes are mechanical: three of
the exports are used only inside their own file (drop the `export` keyword),
two are wholly dead (delete), one dep is documented-dormant (suppress with a
justification comment), and two deps are leftovers from removed code (remove).

## Current state

`pnpm run fallow:dead-code` output at `09236e63` (verified on HEAD, so this
is NOT caused by any uncommitted working-tree change):

```
● Unused exports (5)
  apps/server/src/mastra/lib/anchor-edit/html-balance-guard.ts (2)
    :19 CONTAINER_TAGS
    :102 computeTagBalance
  apps/client/src/lib/landing-agent.ts
    :4 LANDING_AGENT_API
  apps/client/src/lib/sse-client.ts
    :17 streamSSE
  apps/server/src/mastra/lib/anchor-edit/dsl.ts
    :26 formatLabeledLine

● Dependencies ─ Unused dependencies (3)
  @workspace/agent-skills (apps/server/package.json)
  diff (apps/server/package.json)
  lru-cache (apps/server/package.json)
```

Per-symbol verdicts (verified by grep during the audit):

1. `html-balance-guard.ts:19 export const CONTAINER_TAGS` and `:102 export
   function computeTagBalance` — both ARE used, but only inside
   `html-balance-guard.ts` itself (lines 90, 104, 134, 146). Fix: delete the
   `export` keyword on both.
2. `dsl.ts:26 export function formatLabeledLine` — used internally at
   `dsl.ts:15` and `:22` only. Fix: delete the `export` keyword.
3. `landing-agent.ts:4 export const LANDING_AGENT_API` — zero references
   anywhere (the client posts to the agent endpoint via other helpers).
   Fix: delete the constant line entirely.
4. `sse-client.ts:17 export async function streamSSE` — zero callers; only
   `streamSSEGet` (same file) is used by `projects-page.tsx` and
   `use-landing-page.ts`. Fix: delete the whole `streamSSE` function
   (lines ~17-29) and update the file's header comment, which currently
   describes both functions ("Minimal SSE client. `streamSSE` does a POST …
   `streamSSEGet` opens a long-lived GET subscribe stream …") to describe
   only `streamSSEGet`.
5. `@workspace/agent-skills` dep — **documented-dormant, do NOT remove**:
   `apps/server/src/mastra/AGENTS.md` says "`@workspace/agent-skills` remains
   workspace dep + package (reversible) but no longer imported." Fix:
   suppress with a `// fallow-ignore-next-line unused-dependencies` comment
   on the line above the dep entry in `apps/server/package.json`, with a
   short justification (`documented dormant skill pkg, kept reversible`).
   If JSONC-style comments are not honored by fallow inside package.json,
   use the `.fallowrc.jsonc` ignore mechanism instead (read
   `.fallowrc.jsonc` first and follow its existing ignore pattern) — pick
   whichever the tool actually respects and note your choice.
6. `diff` dep — leftover from the removed v1 line-number edit engine. Zero
   imports. Fix: remove the `"diff": "catalog:",` line from
   `apps/server/package.json` `dependencies`. Do NOT remove the catalog
   entry in `pnpm-workspace.yaml` (harmless, and removal is a separate
   decision).
7. `lru-cache` dep — currently unused, but plan
   `plans/003-bound-turn-cache-with-lru.md` will use it to bound the turn
   cache. Fix: remove `"lru-cache": "catalog:",` from
   `apps/server/package.json` now (gate goes green); plan 003 re-adds the
   identical line when it lands (its instructions already cover this). Do
   NOT touch the `pnpm-workspace.yaml` catalog entry.

### Repo conventions to match

- After editing `apps/server/package.json`, run `pnpm install` so
  `pnpm-lock.yaml` updates — CI runs `pnpm install --frozen-lockfile` and
  will fail on a stale lockfile. The lockfile diff must be limited to the
  removed deps.
- JSON files do not support comments — if you find `apps/server/package.json`
  cannot carry the `fallow-ignore` comment for item 5, that confirms the
  `.fallowrc.jsonc` route; `.fallowrc.jsonc` is JSONC (comments allowed).
- Verification commands below are the repo's real gates (from
  `package.json` + `.github/workflows/ci.yml`).

## Commands you will need

| Purpose        | Command                                    | Expected on success |
|----------------|--------------------------------------------|---------------------|
| Dead-code gate | `pnpm run fallow:dead-code`                | exit 0, `✓` summary |
| Install        | `pnpm install`                             | exit 0              |
| Typecheck      | `pnpm run typecheck`                       | exit 0, no errors   |
| Lint           | `pnpm run lint`                            | exit 0              |
| Tests          | `pnpm run test`                            | all pass            |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/anchor-edit/html-balance-guard.ts` — un-export two symbols.
- `apps/server/src/mastra/lib/anchor-edit/dsl.ts` — un-export one symbol.
- `apps/client/src/lib/landing-agent.ts` — delete `LANDING_AGENT_API`.
- `apps/client/src/lib/sse-client.ts` — delete `streamSSE` + update header comment.
- `apps/server/package.json` — remove `diff` + `lru-cache`; suppress (or
  route to `.fallowrc.jsonc`) the `@workspace/agent-skills` flag.
- `.fallowrc.jsonc` — only if the package.json comment route does not work.
- `pnpm-lock.yaml` — regenerated by `pnpm install`.

**Out of scope** (do NOT touch):
- `pnpm-workspace.yaml` catalog entries for `diff` / `lru-cache` — leave them.
- `packages/agent-skills/` itself — the package stays; only the dep flag is suppressed.
- Any importer of `streamSSEGet` (`projects-page.tsx`, `use-landing-page.ts`) — unchanged.
- `apps/server/src/mastra/lib/anchor-edit/` behavior — only `export` keywords change; no logic edits.

## Git workflow

- Branch: `advisor/009-fallow-dead-code-green`.
- Commit message style (match repo's conventional commits, e.g.
  `fix(server): ...`, `chore: ...`): suggested
  `chore: clear fallow dead-code flags (exports, deps) to green CI`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Un-export the three internally-used symbols

- `apps/server/src/mastra/lib/anchor-edit/html-balance-guard.ts:19` —
  `export const CONTAINER_TAGS` → `const CONTAINER_TAGS`; `:102` —
  `export function computeTagBalance` → `function computeTagBalance`.
- `apps/server/src/mastra/lib/anchor-edit/dsl.ts:26` —
  `export function formatLabeledLine` → `function formatLabeledLine`.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0 (no
external importer existed, so nothing breaks).

### Step 2: Delete the two wholly-dead symbols

- `apps/client/src/lib/landing-agent.ts` — delete line 4
  (`export const LANDING_AGENT_API = ...`). Keep `SERVER_URL` (other code
  in the file uses it — confirm with
  `grep -n SERVER_URL apps/client/src/lib/landing-agent.ts` before/after).
- `apps/client/src/lib/sse-client.ts` — delete the `streamSSE` function
  and rewrite the top JSDoc to describe only `streamSSEGet`, e.g.:
  `Minimal SSE client. streamSSEGet opens a long-lived GET subscribe stream
  (project events), parses text/event-stream frames, and invokes onEvent
  for each. Returns when the server ends the stream; the caller can cancel
  via signal.`

**Verify**: `pnpm --filter @workspace/client typecheck` → exit 0.

### Step 3: Clean the dependency flags

In `apps/server/package.json`:

1. Delete `"diff": "catalog:",` and `"lru-cache": "catalog:",` from
   `dependencies`.
2. For `@workspace/agent-skills`: first try adding the line
   `// fallow-ignore-next-line unused-dependencies — documented dormant skill pkg, kept reversible (see apps/server/src/mastra/AGENTS.md)`
   immediately above its entry. If `pnpm run fallow:dead-code` still flags
   it (package.json comments may be rejected), revert that and instead add
   an ignore entry in `.fallowrc.jsonc` following the file's existing
   ignore/override pattern (read it first).

**Verify**: `pnpm install` → exit 0; then
`git diff --stat pnpm-lock.yaml` → changed only for the removed deps.

### Step 4: Gate check

**Verify**: `pnpm run fallow:dead-code` → exit 0 with a clean summary
(`✓ no issues` or equivalent — no unused exports, no unused deps).

### Step 5: Full verification

**Verify** (all must pass):
- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → exit 0.
- `pnpm run test` → exit 0, same test count as baseline.
- `pnpm run fallow:dead-code` → exit 0.
- `pnpm run build` → exit 0 (catches any accidental import breakage).

### Step 6: Confirm scope

**Verify**: `git status --short` lists ONLY the in-scope files
(`html-balance-guard.ts`, `dsl.ts`, `landing-agent.ts`, `sse-client.ts`,
`apps/server/package.json`, `pnpm-lock.yaml`, optionally `.fallowrc.jsonc`).

## Test plan

No new tests — this is dead-code removal + config. The existing suites are
the regression net (Step 5). The one behavioral-adjacent risk (deleting
`streamSSE` while something imports it dynamically) is covered by
typecheck + the client tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run fallow:dead-code` exits 0
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
      `pnpm run build` all exit 0
- [ ] `grep -rn "export const CONTAINER_TAGS\|export function computeTagBalance" apps/server/src` returns no matches
- [ ] `grep -rn "LANDING_AGENT_API" apps/client/src` returns no matches
- [ ] `grep -rn "streamSSE(" apps/client/src --include="*.ts*" | grep -v streamSSEGet` returns no matches
- [ ] `git status --short` lists ONLY the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five flagged exports has gained a real caller since this plan
  was written (grep shows an importer outside the defining file). That
  symbol is no longer dead — skip it and report which one.
- `pnpm install` after the dep removals fails or the lockfile diff shows
  unrelated churn (registry/auth issue, or someone added deps).
- Fallow reports NEW flags after your edits (e.g. removing `streamSSE`
  orphans another helper). Report the new flags instead of chasing them.
- Neither the package.json comment nor an obvious `.fallowrc.jsonc` pattern
  suppresses the `@workspace/agent-skills` flag. Report what you tried; do
  NOT remove the dep as a workaround (it is documented-dormant on purpose).

## Maintenance notes

- Plan `plans/003-bound-turn-cache-with-lru.md` re-adds
  `"lru-cache": "catalog:"` to `apps/server/package.json` when it lands —
  that is expected, not a regression of this plan.
- If `@workspace/agent-skills` is ever fully deleted (the DOX says it is
  retained for reversibility), remove the suppression added here in the
  same commit.
- Reviewer: the diff should be keyword/line deletions plus one suppression —
  no logic changes anywhere. Reject any behavioral edit smuggled into
  `html-balance-guard.ts` or `dsl.ts`.
