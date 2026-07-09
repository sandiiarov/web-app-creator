# Plan 015: Surface image-generation usage and cost to the user (direction spike)

> **Executor instructions**: This is a **direction / design spike plan**, not a
> build-everything plan. Investigate, define the surfacing contract, prototype
> the smallest useful version, and list the open questions. Do not over-build.
> Run every verification command. If a "STOP conditions" entry occurs, stop and
> report. Update the status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a43ca336..HEAD -- apps/server/src/mastra/route.ts packages/prompt-panel/src packages/ui/src`
> If in-scope files changed, compare excerpts against live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/012-capture-generate-image-cost.md (the cost number must be correct before surfacing it)
- **Category**: direction
- **Planned at**: commit `a43ca336`, 2026-07-09

## Why this matters

An e2e QA campaign (`screenshots/e2e-5run/REPORT.md`) revealed `generate_image` is a **heavily-used capability the user cannot see**: 9 images generated across 5 projects (project 3 alone generated 4), yet `costBreakdown.image` reports `{ cost: 0, count: 0 }` for all of them — the image count is not tracked either, and the user gets no signal that image generation happened or what it cost. The agent leans on generated imagery for "add an image" requests (rather than placeholders), which is a real product behavior worth making visible. This spike defines how to surface image-gen count + cost in the stats event and the UI, and whether a per-project image budget is warranted.

## Current state

- `apps/server/src/mastra/route.ts:544-553` — accumulates `imageCostUsd` from `generate_image` tool results; `route.ts:637-656` emits `costBreakdown.image: { cost: imageCostUsd, count: ??? }`. Confirm whether `count` is incremented anywhere (the QA showed `count: 0` for 9 images — it appears not to be tracked).
- `apps/server/src/mastra/tools/generate-image.ts` — returns `{ imagesGenerated: 1, ok, url, cost }` per call; `imagesGenerated` is available but may not be summed into the stats.
- The `stats` SSE event (`route.ts` `event: 'stats'`, payload with `costBreakdown`) is consumed by the client. Read `packages/prompt-panel/src/turn-metadata.tsx` and `packages/prompt-panel/src/domain.ts` for how `costBreakdown` is currently rendered (the e2e metrics show `llm`/`vision`/`scrape`/`image` breakdowns exist in the payload — check what the UI actually displays).
- Plan 012 makes `imageCostUsd` accurate; this plan depends on that.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `pnpm run typecheck`             | exit 0              |
| Lint      | `pnpm run lint`                  | exit 0              |
| Format    | `pnpm run format:check`          | exit 0              |
| Tests     | `pnpm run test`                  | all pass, coverage ≥ 90% |

## Scope

**In scope** (prototype the smallest useful surfacing):
- `apps/server/src/mastra/route.ts` — track `imageCount` alongside `imageCostUsd` + include it in `costBreakdown.image`
- `packages/prompt-panel/src/domain.ts` + `turn-metadata.tsx` — render image-gen count + cost where other breakdown items are shown
- Tests for the count tracking (server) and the UI rendering (client, following the existing turn-metadata test pattern if one exists)

**Out of scope** (decide, don't build, in this spike):
- A per-project image-generation budget / hard cap (list as an open question)
- Image-gallery / image-management UI
- Changing which model generates images

## Git workflow

- Branch: `feat/015-surface-image-gen-usage`
- Conventional commits: `feat(stats): track + surface image-generation count and cost`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Investigate current surfacing

Read `route.ts` around the stats emission (lines ~540-660) to confirm whether `imageCount` is tracked (grep `imageCount`, `imagesGenerated`). Read `packages/prompt-panel/src/turn-metadata.tsx` + `domain.ts` to see which `costBreakdown` fields the UI currently displays and the rendering pattern. Write a 3-5 line summary of findings at the top of the plan's investigation notes (in the PR description or a `plans/notes/` doc — not required to be committed).

**Verify**: you can state, with file:line evidence, (a) whether image count is tracked, (b) what the UI shows today for `costBreakdown.image`.

### Step 2: Track image count server-side

In `route.ts`, add an `imageCount` accumulator incremented by `result.imagesGenerated` on each successful `generate_image` result (next to the existing `imageCostUsd` accumulation, ~line 553). Include it in `costBreakdown.image: { cost: imageCostUsd, count: imageCount }`.

**Verify**: `pnpm run typecheck` → exit 0; a manual or test assertion that a `generate_image` call produces `count: 1`.

### Step 3: Surface in the UI

In `packages/prompt-panel`, wherever `costBreakdown.vision` or `.scrape` is rendered (turn-metadata), add image-gen count + cost display in the same style (e.g. "Images: 2 · $0.024"). Follow the existing component's prop/typing pattern from `domain.ts`.

**Verify**: `pnpm run typecheck` + `pnpm run lint` + `pnpm run format:check` → exit 0.

### Step 4: Tests

- Server: extend the route test that checks `costBreakdown` (search `route.test.ts` for `costBreakdown` or `stats`) to assert `image.count` increments on a `generate_image` tool-result.
- Client: if a turn-metadata test exists, extend it; otherwise add a minimal render test asserting the image-gen line appears when `costBreakdown.image.count > 0`.

**Verify**: `pnpm run test` → all pass.

## Done criteria

- [ ] `costBreakdown.image.count` reflects the number of generated images (test confirms)
- [ ] The UI shows image-gen count + cost alongside the other breakdown items
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test` all exit 0
- [ ] Open questions (below) are answered or explicitly deferred with a rationale
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 012 is not done (the cost number would be wrong — STOP, do 012 first).
- The UI does not currently render any `costBreakdown` fields (if the breakdown is server-only and never shown, reconsider whether UI surfacing is in scope for this spike; report back).
- `costBreakdown.image` shape is relied upon by an external consumer (grep for `.image` usage across packages; if a contract exists, don't break it).

## Open questions (resolve or defer)

1. **Budget?** Should there be a per-project image-generation cap (analogous to the cost cap in plan 004), given the agent can generate 4+ images in one project? Default recommendation: defer — measure usage first via the new count surfacing, add a cap only if cost runs away.
2. **Per-image attribution?** Should the UI show which sections got generated images, or just an aggregate count? Default: aggregate count for this spike.
3. **Failure visibility?** When `generate_image` returns `ok:false` (e.g. no API key), should that be surfaced distinctly? Default: yes, count only successful generations; failures already return a `reason` the agent relays.

## Maintenance notes

- After this lands, the `vision.calls` vs `image.count` distinction in stats is the key signal for how much the agent relies on each visual path — watch both.
- If a per-project image budget is added later, it should reuse the cost-cap infrastructure (plan 004) rather than a parallel mechanism.
