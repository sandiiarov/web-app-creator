# Plan 001: Restore the dead-code verification gate

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only files listed in Scope. If a STOP condition occurs, stop and report; do not improvise. Make exactly one commit for this plan. When done, update only plan 001's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9b8d66b6..HEAD -- apps/client/src/App.tsx apps/server/src/mastra/agents/landing-page-agent.ts apps/server/src/mastra/tools/landing-tools.ts apps/server/src/mastra/AGENTS.md`
>
> If an implementation file changed, compare the Current state excerpts with live code. A mismatch is a STOP condition. `plans/README.md` is intentionally excluded because prior executors may update the status ledger.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tech-debt
- **Planned at**: commit `9b8d66b6`, 2026-07-11

## Why this matters

The repository's CI explicitly runs `pnpm run fallow:dead-code`, but that command fails at current HEAD with four unused value exports and one unused type export. Until this is clean, the declared full verification baseline is red and later regressions are harder to distinguish. The cleanup is API-surface-only: preserve values that are used within their module and delete registry summaries that have no consumer.

## Current state

Applicable contracts:

- Root `AGENTS.md` requires all full-repo gates and a DOX pass after meaningful changes.
- `apps/server/src/mastra/AGENTS.md` currently says `tools/landing-tools.ts` is the source of truth for the enabled tools, “tool count/list, and tool guidance.” The count/list/guidance summary exports are actually unused and should no longer be named as contracts.
- Tests must not assert system-prompt prose. This plan changes no prose and adds no prose tests.

Current findings:

```ts
// apps/server/src/mastra/agents/landing-page-agent.ts:21
export const LANDING_AGENT_INSTRUCTIONS = [
  // ...
].join('\n')
```

`LANDING_AGENT_INSTRUCTIONS` is used by both agent constructors in the same file but has no external importer. Keep the constant; remove only its `export` modifier.

```ts
// apps/server/src/mastra/tools/landing-tools.ts:94-102
export const LANDING_TOOL_COUNT = LANDING_TOOL_DEFINITIONS.length

export const LANDING_TOOL_GUIDANCE = LANDING_TOOL_DEFINITIONS.map(
  ({ guidance }) => `- ${guidance}`,
).join('\n')

export const LANDING_TOOL_LIST = LANDING_TOOL_DEFINITIONS.map(
  ({ id }) => id,
).join(', ')
```

These three declarations have no internal or external consumer. Delete the complete declarations; merely removing `export` would create lint failures for unused locals. Keep `LANDING_TOOL_DEFINITIONS` and `createLandingTools` unchanged.

```tsx
// apps/client/src/App.tsx:22
export interface EditorPageProps {
  projectId: string
}
```

`EditorPageProps` is used only in `App.tsx`. Keep the interface and remove only `export`.

Observed commit style is Conventional Commits, for example `9b8d66b6 feat: add cumulative project spend tracking`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused lint | `pnpm --filter @workspace/client lint && pnpm --filter @workspace/server lint` | exit 0; existing warnings are allowed, no errors |
| Focused typecheck | `pnpm --filter @workspace/client typecheck && pnpm --filter @workspace/server typecheck` | exit 0, no errors |
| Dead code | `pnpm run fallow:dead-code` | exit 0 and no findings |
| Full gate | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` | every command exits 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Scope

**Implementation files in scope**:

- `apps/server/src/mastra/agents/landing-page-agent.ts`
- `apps/server/src/mastra/tools/landing-tools.ts`
- `apps/client/src/App.tsx`
- `apps/server/src/mastra/AGENTS.md`

**Administrative file in scope**:

- `plans/README.md` — update only plan 001's status cell after verification.

**Out of scope**:

- Prompt wording, tool registry membership/order, tool schemas, or agent behavior.
- Fallow configuration or suppressions. Do not hide findings.
- Other dead-code cleanup, lint warnings, package exports, dependencies, lockfiles, or formatting churn.

## Git workflow

- Work on the current operator-selected branch/worktree.
- Produce exactly one commit: `chore(repo): restore dead-code gate`.
- Include only the files in Scope. Do not push or open a PR.

## Steps

### Step 1: Remove only the dead public surface

1. In `landing-page-agent.ts`, change `export const LANDING_AGENT_INSTRUCTIONS` to a module-local `const`.
2. In `landing-tools.ts`, delete the complete declarations of `LANDING_TOOL_COUNT`, `LANDING_TOOL_GUIDANCE`, and `LANDING_TOOL_LIST`.
3. In `App.tsx`, change `export interface EditorPageProps` to a module-local `interface`.
4. Do not rename the surviving symbols or alter their uses.

**Verify**:

```bash
pnpm --filter @workspace/client typecheck && pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/client lint && pnpm --filter @workspace/server lint
```

Expected: all commands exit 0; no new warnings.

### Step 2: Synchronize the nearest DOX contract

In `apps/server/src/mastra/AGENTS.md`, revise only the sentence that says `landing-tools.ts` owns the “tool count/list, and tool guidance.” Keep the durable contract that `LANDING_TOOL_DEFINITIONS`/`landing-tools.ts` is the source of truth for enabled tools and their construction. Do not add historical commentary.

**Verify**:

```bash
git diff --check -- apps/server/src/mastra/AGENTS.md
git grep -n 'LANDING_TOOL_COUNT\|LANDING_TOOL_GUIDANCE\|LANDING_TOOL_LIST' -- apps/server/src/mastra/AGENTS.md apps/server/src/mastra/tools/landing-tools.ts
```

Expected: first command exits 0; second command returns no matches (exit 1 is expected for no matches).

### Step 3: Re-establish all gates and commit

Run the dead-code gate first, then the full repository gate. Update plan 001's status to `DONE` only after everything passes. Review `git status --short`, then make the single commit.

**Verify**:

```bash
pnpm run fallow:dead-code
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
git diff --check
git status --short
```

Expected: all verification commands exit 0; status lists only files in Scope before commit. After commit, `git status --short` is empty unless the operator had explicitly identified pre-existing unrelated changes, which must remain untouched.

## Test plan

No new runtime tests are needed because behavior does not change. Typecheck proves internal users still resolve; lint proves deleted exports did not become unused locals; Fallow is the regression test for the public-surface issue.

## Done criteria

- [ ] `pnpm run fallow:dead-code` exits 0 with no findings.
- [ ] `LANDING_AGENT_INSTRUCTIONS` and `EditorPageProps` still exist and are module-local.
- [ ] The three unused `LANDING_TOOL_*` summary declarations no longer exist.
- [ ] Tool registry contents and prompt text are byte-for-byte unchanged apart from removed declarations/modifiers.
- [ ] `apps/server/src/mastra/AGENTS.md` describes the live source-of-truth contract without removed exports.
- [ ] Full format, lint, typecheck, test, and build gates pass.
- [ ] Exactly one commit exists for the plan with message `chore(repo): restore dead-code gate`.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Any named symbol has gained an external importer since `9b8d66b6`.
- Removing an export changes a package entry point or a test intentionally imports it.
- `pnpm run fallow:dead-code` still reports findings after the named cleanup.
- Passing the gate requires a Fallow ignore/suppression or unrelated cleanup.
- A verification command fails twice after correcting a direct mistake in scoped files.

## Maintenance notes

Keep prompt/tool inventory tests focused on executable loader or registry behavior, not Markdown/system-prompt wording. If a registry summary is needed later, add it only with a real consumer and an executable contract test; do not export speculative API surface.
