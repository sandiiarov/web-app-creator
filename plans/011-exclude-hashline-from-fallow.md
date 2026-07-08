# Plan 011: Exclude the vendored hashline engine from fallow dead-code analysis

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4e199c45..HEAD -- .fallowrc.jsonc apps/server/oxlint.config.ts apps/server/src/mastra/AGENTS.md`
> If any in-scope file changed since this plan was written, compare "Current
> state" against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `4e199c45`, 2026-07-07

## Why this matters

`pnpm run fallow:dead-code` currently **exits non-zero** because the vendored
hashline engine exposes ~56 symbols no first-party caller uses (37 unused
exports, 8 unused types, 11 unused class members across
`apps/server/src/mastra/lib/hashline/`). These are features copied from the
upstream `pi-hashline` engine that this consumer doesn't exercise — diff
preview (`buildCompactDiffPreview`), the streaming parser
(`parsePatchStreaming`, `parseLid`), snapshot-store extras
(`SnapshotStore.clear/head/invalidate`), and alternate APIs
(`Patch.parseEdits`, `Patcher.apply`, `MismatchError.displayMessage`).

This is **vendored code**, and the repo already treats `lib/hashline/**` as
exempt from first-party style rules: `apps/server/oxlint.config.ts` overrides
the perfectionist sort + `no-explicit-any` rules for that subtree. Dead-code
analysis should follow the same policy — you don't run unused-export detection
against vendored/third-party code, because its public surface is intentionally
larger than any single consumer. Excluding it makes `fallow:dead-code` green
(removing a noisy failing gate) **without touching the correctness-critical
engine**, and documents the vendored boundary explicitly.

The alternative — deleting the 56 symbols — is rejected here as the default:
MED risk on code that was just vendored and live-verified this session, for
only cosmetic gain. (Deletion remains a valid future follow-up; see
Maintenance notes.)

## Current state

- `.fallowrc.jsonc` — the fallow config. Today:
  ```jsonc
  {
    "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
    "entry": ["**/oxfmt.config.ts"],
    "ignoreDependencies": [
      "@workspace/typescript-config",
      "eslint-plugin-perfectionist",
      "eslint-plugin-react-refresh",
      "oxlint-tailwindcss"
    ]
  }
  ```
  It has `entry` and `ignoreDependencies` but **no source-path exclude**.
- `apps/server/oxlint.config.ts` — already exempts `lib/hashline/**` from
  perfectionist sort + `no-explicit-any`. This is the precedent for the same
  policy in fallow.
- `apps/server/src/mastra/AGENTS.md` — documents the vendored hashline engine.
  A one-line note that fallow excludes the subtree belongs here.

The failing output (abbreviated; full list via `pnpm run fallow:dead-code`):

```text
● Unused exports (37)   — apps/server/src/mastra/lib/hashline/{format,messages,mismatch,parser,tokenizer,apply,block,...}
● Unused type exports (8) — hashline/types.ts (CompactDiffOptions, CompactDiffPreview, StreamOptions), project-store.ts re-exports, hashline/input.ts (RawSection), landing-preview agent-map-plugin.ts (AgentMapOptions)
● Unused class members (11) — hashline/snapshots.ts (SnapshotStore.clear/head/invalidate/recordSeenLines, InMemorySnapshotStore.*), hashline/input.ts (Patch.parseEdits), hashline/mismatch.ts (MismatchError.displayMessage), hashline/patcher.ts (Patcher.apply)
✗ 4 files · 37 exports · 8 types · 11 class members
```

Note: one of the 8 unused types — `AgentMapOptions` in
`packages/landing-preview/src/agent-map-plugin.ts` — is **not** vendored; it is
the option type for the `agentMap()` factory. Step 2 handles it separately
(likely drop the export, keep the local type).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| See current failures | `pnpm run fallow:dead-code` | (before fix) exits 1 with the hashline list |
| Confirm fix | `pnpm run fallow:dead-code` | (after fix) exits 0, no hashline entries |
| fallow schema (if key name is uncertain) | `cat .fallowrc.jsonc` + schema URL above | — |

## Scope

**In scope**:
- `.fallowrc.jsonc` — add a source-path exclude for the vendored hashline subtree.
- `packages/landing-preview/src/agent-map-plugin.ts` — handle the non-vendored `AgentMapOptions` unused-export (Step 2).
- `apps/server/src/mastra/AGENTS.md` — one-line note documenting the fallow exclusion policy for the vendored engine.

**Out of scope** (do NOT touch):
- `apps/server/src/mastra/lib/hashline/**` source — correctness-critical vendored code; this plan must not edit it. (That is the whole point of excluding rather than deleting.)
- Any other fallow config knobs (`entry`, `ignoreDependencies`).

## Git workflow

- Branch: `advisor/011-exclude-hashline-from-fallow`.
- Commit style matching `git log`, e.g.
  `chore(fallow): exclude vendored hashline engine from dead-code analysis [plan-011]`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the vendored subtree to fallow's exclude

Add a source-path exclude for `apps/server/src/mastra/lib/hashline/**` to
`.fallowrc.jsonc`. The most likely key is `exclude` (a glob array); if the
schema uses a different name (e.g. `ignore`, `excludeGlobs`), use that.

Target shape (if the key is `exclude`):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
  "entry": ["**/oxfmt.config.ts"],
  "exclude": ["apps/server/src/mastra/lib/hashline/**"],
  "ignoreDependencies": [
    "@workspace/typescript-config",
    "eslint-plugin-perfectionist",
    "eslint-plugin-react-refresh",
    "oxlint-tailwindcss"
  ]
}
```

**Verify**: `pnpm run fallow:dead-code 2>&1 | grep -E "hashline"` → no matches
(all hashline entries gone). The command may still report the single
`AgentMapOptions` non-vendored item — that's Step 2.

### Step 2: Handle the non-vendored `AgentMapOptions` unused export

In `packages/landing-preview/src/agent-map-plugin.ts`, `AgentMapOptions` is
exported but unused. Two acceptable fixes — pick the simpler:

- **Drop the `export` keyword** on `AgentMapOptions` (keep the type, use it
  locally for the `agentMap` factory signature). Preferred if nothing imports it.
- OR add `// fallow-ignore-next-line unused-types` above the export if the type
  is meant to be public API for future consumers.

Confirm with `grep -rn "AgentMapOptions" apps packages` that nothing imports it
before dropping the export.

**Verify**: `pnpm run fallow:dead-code` → exits 0 (no unused-types entries remain).

### Step 3: Document the policy in the mastra DOX

In `apps/server/src/mastra/AGENTS.md`, in the hashline section, add one line
noting that `lib/hashline/**` is excluded from `fallow:dead-code` (vendored
code, public surface intentionally larger than this consumer) — consistent with
the existing oxlint exemption noted there.

**Verify**: `grep -nE "fallow" apps/server/src/mastra/AGENTS.md` → ≥1 match.

### Step 4: Full gate

**Verify**:
- `pnpm run fallow:dead-code` → exit 0.
- `pnpm run lint && pnpm run format:check` → exit 0 (the `.fallowrc.jsonc`
  edit + the `agent-map-plugin.ts` edit should be lint/format-clean).
- `pnpm --filter @workspace/landing-preview typecheck` → exit 0 (the
  `AgentMapOptions` change in Step 2 must not break the type that `agentMap`
  uses internally).

## Test plan

- No automated tests — this is config + a doc note + a one-keyword edit.
  Verification is the `fallow:dead-code` exit code + typecheck.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run fallow:dead-code` exits 0
- [ ] `pnpm run fallow:dead-code 2>&1 | grep -c hashline` → `0`
- [ ] `pnpm run lint && pnpm run format:check` exit 0
- [ ] `pnpm --filter @workspace/landing-preview typecheck` exits 0
- [ ] `git status` shows only `.fallowrc.jsonc`,
      `packages/landing-preview/src/agent-map-plugin.ts`, and
      `apps/server/src/mastra/AGENTS.md` modified
- [ ] `plans/README.md` status row for 011 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `.fallowrc.jsonc` no longer matches the excerpt in "Current state" (drifted).
- fallow does not recognize `exclude` (or `ignore`/`excludeGlobs`) as a
  source-path key — open the schema URL at the top of `.fallowrc.jsonc`, find
  the correct key name, and use it; if none exists, STOP and report (the
  fallback is per-line `// fallow-ignore` comments, which is noisier and worth
  a maintainer decision).
- After excluding `lib/hashline/**`, fallow still exits non-zero for reasons
  unrelated to `AgentMapOptions` — report the remaining items rather than
  excluding more broad paths.
- `AgentMapOptions` turns out to be imported somewhere the grep missed (e.g.
  a test) — keep the export and use `// fallow-ignore-next-line` instead.

## Maintenance notes

- **Re-verify this exclusion stays correct whenever `@zumer/snapdom` or the
  hashline engine is re-vendored/upgraded.** If hashline is ever de-vendored
  (consumed as a real dependency), remove the exclusion so its surface is
  analyzed again.
- The legitimate follow-up this plan deliberately defers: **delete the unused
  vendored symbols** to shrink the engine. That is MED risk on correctness-
  critical code and should be its own plan with the full test gate + a live
  smoke (the engine was live-verified this session; deletion must not regress
  that). Do not bundle it here.
- A reviewer should scrutinize only that the exclusion glob is scoped to
  `lib/hashline/**` (not broader) and that `AgentMapOptions` was handled
  deliberately, not silently dropped if it had consumers.
