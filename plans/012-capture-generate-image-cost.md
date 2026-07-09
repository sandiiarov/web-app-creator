# Plan 012: Capture `generate_image` cost via a per-image price fallback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a43ca336..HEAD -- apps/server/src/mastra/lib/cost.ts apps/server/src/mastra/tools/generate-image.ts apps/server/src/mastra/route.ts apps/server/src/config-env.ts`
> If any in-scope file changed, compare excerpts against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a43ca336`, 2026-07-09

## Why this matters

An e2e QA campaign (5 projects, `screenshots/e2e-5run/REPORT.md`) generated **9 images** via the `generate_image` tool (Seedream 4.5). Every one of them shows **$0.00** in `costBreakdown.image.cost` — the operator pays for image generation but the stats event reports zero image cost, so true per-run cost is understated. Root cause: OpenRouter's `/api/v1/images` response does not include a per-call cost field, so `providerReportedCost` returns 0, and `imageGenCost` ignores the image count it receives. The fix mirrors how `firecrawlCost` already handles a provider that reports usage units instead of dollars: multiply a configured per-unit price by the count.

## Current state

- `apps/server/src/mastra/lib/cost.ts` — `imageGenCost` receives the image count but discards it:
  ```ts
  // cost.ts:37-42
  export function imageGenCost(
    _imagesGenerated: number,
    providerCost?: number,
  ): number {
    return providerReportedCost(providerCost)
  }
  ```
  `providerReportedCost` (cost.ts:44) returns 0 when the source has no `cost`/`total_cost`/`estimated_cost` field. The OpenRouter image API response shape (`OpenRouterImageResponse` in generate-image.ts) declares `usage?: { cost?, estimated_cost?, total_cost? }` but OpenRouter does not populate it for image generation — confirmed empirically (9 images, all $0).

- `apps/server/src/mastra/tools/generate-image.ts` — returns `cost: providerCost > 0 ? providerCost : undefined` (line ~131), so `undefined` flows to the route when the provider omits cost.

- `apps/server/src/mastra/route.ts:544-553` — accumulates image cost:
  ```ts
  if (chunk.payload.toolName === 'generate_image' && !isError) {
    // ...
    imageCostUsd += imageGenCost(result.imagesGenerated, result.cost)
  }
  ```

- `apps/server/src/config-env.ts:6` — `DEFAULT_OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5'`; the model id is configurable via `OPENROUTER_IMAGE_MODEL`.

- Repo convention for a provider-price config: `firecrawlCost(creditsUsed, creditUsd)` reads a configured USD-per-credit (`config.firecrawl.creditUsd`). Match that pattern. Config is loaded in `apps/server/src/config-env.ts` via `optionalEnv`/`requiredEnv`; see how `creditUsd` is wired there.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Install   | `pnpm install`                                   | exit 0              |
| Typecheck | `pnpm run typecheck`                             | exit 0, no errors   |
| Lint      | `pnpm run lint`                                  | exit 0              |
| Format    | `pnpm run format:check`                          | exit 0              |
| Tests     | `pnpm --filter @workspace/server test -- --run cost` | all pass        |
| Full test | `pnpm run test`                                  | all pass, coverage ≥ 90% |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/cost.ts` — `imageGenCost` fallback
- `apps/server/src/mastra/lib/cost.test.ts` (create if absent, or extend existing cost tests)
- `apps/server/src/config-env.ts` — add `OPENROUTER_IMAGE_PRICE_USD` env + config field
- `apps/server/src/config.ts` — expose `config.openrouter.imagePriceUsd` (follow the `creditUsd` pattern)

**Out of scope**:
- `generate-image.ts` (no change needed — it already returns `imagesGenerated` + `cost`)
- `route.ts` (already calls `imageGenCost(result.imagesGenerated, result.cost)` correctly)
- UI / stats event shape changes (that is plan 015)

## Git workflow

- Branch: `fix/012-image-gen-cost`
- Commit per logical unit; conventional-commit style: `fix(cost): <summary>` (match `git log --oneline -5` style).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Look up the Seedream 4.5 per-image price

Use the `openrouter` skill (`~/.pi/agent/skills/openrouter/SKILL.md`) or OpenRouter's pricing page to find the per-image price for `bytedance-seed/seedream-4.5`. Record the USD-per-image value. If the skill is unavailable, document the looked-up price + source URL in the commit message.

**Verify**: you have a positive number (e.g. `0.012`) + a source.

### Step 2: Add the price config

In `apps/server/src/config-env.ts`, add a `DEFAULT_OPENROUTER_IMAGE_PRICE_USD` constant (the looked-up value) + wire it through `optionalEnv(source, 'OPENROUTER_IMAGE_PRICE_USD') ?? DEFAULT_OPENROUTER_IMAGE_PRICE_USD` into `config.openrouter.imagePriceUsd`, mirroring how `firecrawl.creditUsd` is configured. In `apps/server/src/config.ts` expose it on the typed config object.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Add the count-based fallback in `imageGenCost`

Change `imageGenCost` to use the count when the provider reports no cost:
```ts
export function imageGenCost(
  imagesGenerated: number,
  providerCost?: number,
  pricePerImageUsd?: number,
): number {
  const reported = providerReportedCost(providerCost)
  if (reported > 0) return reported
  const price = pricePerImageUsd ?? 0
  if (!imagesGenerated || imagesGenerated <= 0 || price <= 0) return 0
  return imagesGenerated * price
}
```
Update the call site in `route.ts` (~line 553) to pass `config.openrouter.imagePriceUsd` as the third arg.

**Verify**: `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0.

### Step 4: Tests

Add/extend tests in `apps/server/src/mastra/lib/cost.test.ts`:
- `imageGenCost(2, undefined, 0.012)` → `0.024` (count fallback when provider omits cost)
- `imageGenCost(2, 0.05, 0.012)` → `0.05` (provider-reported cost wins)
- `imageGenCost(0, undefined, 0.012)` → `0` (no images)
- `imageGenCost(2, undefined, 0)` → `0` (no price configured — backward-compat)

Model after an existing cost test in that file (or `firecrawlCost` tests if present).

**Verify**: `pnpm --filter @workspace/server test -- --run cost` → all pass.

## Done criteria

- [ ] `pnpm run typecheck` exits 0
- [ ] `pnpm run lint` + `pnpm run format:check` exit 0
- [ ] `pnpm run test` exits 0; new `imageGenCost` tests exist + pass
- [ ] `costBreakdown.image.cost` is non-zero for a `generate_image` call when the price env is set (manual or test confirmation)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The Seedream 4.5 price cannot be determined from OpenRouter (STOP, report — do not guess a price).
- `imageGenCost` has callers other than `route.ts:553` that pass a different signature (reconcile before changing the signature).
- The config pattern for `creditUsd` has drifted from what's described (re-read `config-env.ts` before wiring).

## Maintenance notes

- When `OPENROUTER_IMAGE_MODEL` is changed to a different provider, the per-image price env must be updated too (or cost silently drops to 0 again). Consider a price table keyed by model id as a follow-up if multiple image models are used.
- If OpenRouter later begins reporting image cost in the response, the provider-reported value already wins (the fallback only applies when it's 0/absent).
