# Plan 014: Add a minimal-change principle for fix/refine requests to the agent instructions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a43ca336..HEAD -- apps/server/src/mastra/agents/landing-page-agent.ts`
> If the file changed, compare the "Current state" excerpt against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a43ca336`, 2026-07-09

## Why this matters

An e2e QA campaign (`screenshots/e2e-5run/REPORT.md`) showed the agent **over-scope a simple fix**: project 2's prompt *"fix hero contrast + center the reserve button"* became a full hero redesign with a generated background image (`generate_image` "Mediterranean grill over open fire"), taking >700s and causing the subsequent turn to be skipped. The instructions already constrain the *edit DSL* scope ("target only the lines that change", "never a widened SWAP") but say nothing about *request-level* scope — when a user asks for a fix, the agent should make the smallest change that satisfies the request, not redesign unmentioned sections. A one-line instruction addition reduces wasted cost/time and keeps the agent aligned with user intent.

## Current state

- `apps/server/src/mastra/agents/landing-page-agent.ts:16-39` — `LANDING_AGENT_INSTRUCTIONS` is an array of strings joined with `\n`. Relevant existing bullets:
  - `"Every turn: understand the request, use the available tools below, and leave the page better than you found it."`
  - `"For follow-up edits, read or find first to get a fresh #TAG + line numbers, then target only the lines that change (pure additions use INS, never a widened SWAP). Touch only lines your read displayed."`
  - `"Apply the design skill rigorously... Ship restrained, intentional, accessible design."`
- The array is module-local (`const`, not exported) and passed to `new Agent({ instructions: LANDING_AGENT_INSTRUCTIONS, ... })` at lines 56 and 83.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `pnpm run typecheck`             | exit 0, no errors   |
| Lint      | `pnpm run lint`                  | exit 0              |
| Format    | `pnpm run format:check`          | exit 0              |
| Tests     | `pnpm --filter @workspace/server test -- --run landing` | all pass |
| Full test | `pnpm run test`                  | all pass, coverage ≥ 90% |

## Scope

**In scope**:
- `apps/server/src/mastra/agents/landing-page-agent.ts` — add one instruction bullet
- `apps/server/src/mastra/agents/landing-page-agent.test.ts` (create) — regression guard that the instructions contain the minimal-change principle

**Out of scope**:
- Any tool code, route code, or prompt content other than the one new bullet
- Changing the design skill or its references
- The hashline edit-DSL guidance (already correct)

## Git workflow

- Branch: `fix/014-minimal-change-instruction`
- Conventional commit: `fix(agent): instruct minimal changes for fix/refine requests`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the minimal-change bullet

Insert a new string element into the `LANDING_AGENT_INSTRUCTIONS` array (place it right after the "Every turn: understand the request..." bullet, before the tool guidance). Suggested text (keep it terse, matching the existing voice):

```
"For fix and refinement requests, make the smallest change that satisfies the request. Do not redesign or regenerate sections the user did not mention. If a fix genuinely requires a larger change (e.g. the layout cannot hold the fix), state that briefly first and still limit edits to the affected region. Prefer adjusting existing tokens, copy, or rules over generating new imagery or restructuring the page."
```

**Verify**: `pnpm run typecheck` → exit 0.

### Step 2: Export the instructions constant for a regression test

Change `const LANDING_AGENT_INSTRUCTIONS` to `export const LANDING_AGENT_INSTRUCTIONS` so a test can assert on its content. (It is already consumed only inside this module; exporting it is safe and lets the test import it.)

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Add a regression-guard test

Create `apps/server/src/mastra/agents/landing-page-agent.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { LANDING_AGENT_INSTRUCTIONS } from './landing-page-agent.ts'

describe('LANDING_AGENT_INSTRUCTIONS', () => {
  it('tells the agent to make minimal changes for fix/refine requests', () => {
    const text = Array.isArray(LANDING_AGENT_INSTRUCTIONS)
      ? LANDING_AGENT_INSTRUCTIONS.join('\n')
      : LANDING_AGENT_INSTRUCTIONS
    expect(text).toMatch(/smallest change/i)
    expect(text).toMatch(/do not redesign/i)
  })
})
```
Match the repo's test style — see `apps/server/src/mastra/tools/read.test.ts` for the `describe`/`it`/`vitest` import pattern.

**Verify**: `pnpm --filter @workspace/server test -- --run landing` → passes, +1 test.

## Done criteria

- [ ] `grep -q "smallest change" apps/server/src/mastra/agents/landing-page-agent.ts` → exit 0
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` all exit 0
- [ ] `pnpm run test` exits 0; the new regression-guard test passes
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- `LANDING_AGENT_INSTRUCTIONS` is consumed elsewhere in a way that exporting it would break (grep `LANDING_AGENT_INSTRUCTIONS` across the repo; it is only used at lines 56/83 in this file — confirm before exporting).
- The existing instructions already contain an equivalent minimal-change rule (re-read; if so, sharpen it rather than duplicate).

## Maintenance notes

- This is prompt-level guidance; the real validation is behavioral (re-run an e2e fix-request turn and confirm the agent no longer over-scopes). The unit test only guards against the text being removed.
- If the agent over-corrects into too-timid changes, soften "smallest change" to "smallest reasonable change" — tune based on e2e observation.
