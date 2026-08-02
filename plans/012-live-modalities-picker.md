# Plan 012: Drive the picker's vision-sync from live OpenRouter modalities

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09236e63 -- apps/server/src/model-catalog.ts apps/server/src/index.ts packages/prompt-panel/src/domain.ts packages/prompt-panel/src/model-dropdown.tsx apps/client/src/hooks/use-model-pricing.ts apps/client/src/App.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches the vision-sync invariant UX; server change is additive)
- **Depends on**: none
- **Category**: direction / dx (removes a capability-drift class)
- **Planned at**: commit `09236e63`, 2026-08-02

## Why this matters

Two capability checks decide whether images go straight to the chat model
("direct mode") or to the separate vision model ("OCR fallback"):

- **Server** (authoritative at runtime): `supportsImageInput(textModel)` in
  `apps/server/src/mastra/lib/model-capabilities.ts` reads the LIVE
  OpenRouter `/models` catalog `architecture.input_modalities`.
- **Client picker** (decides what the user sees): the vision-sync invariant
  in `packages/prompt-panel/src/domain.ts` uses a STATIC proxy — membership
  in `VISION_MODEL_OPTIONS`.

These can disagree. Concrete instance: `x-ai/grok-4.5` is image-capable per
the live catalog, but the picker didn't sync vision to it until a human
noticed and hand-added it to the vision options. Every new vision-capable
model repeats that drift: server silently goes direct while the UI still
offers a free vision dropdown. This plan exposes the server's live modality
data through the existing `/api/models` proxy and lets the dropdown prefer
it, so capability is defined once (OpenRouter's catalog) for both.

## Current state

- `apps/server/src/model-catalog.ts`:
  - `ModelPricingEntry` = `{ cacheRead?, image?, imageOutput?, input, output }`.
  - `parseModelPricing(json)` reads `pricing.prompt/completion/
    input_cache_read/image_output` per entry; `OpenRouterModelEntry`
    interface has `id?` + `pricing?` only — the upstream entries ALSO carry
    `architecture: { input_modalities?: string[] }` (verified live:
    `x-ai/grok-4.5` → `["text","image","file"]`,
    `z-ai/glm-5.2` → `["text"]`).
  - `getImageModelPricing(ids)` enrichment (for chat-absent image models)
    returns `{ image?, imageOutput? }` — no modalities; not needed there.
- `apps/server/src/index.ts` `handleModelCatalog` returns
  `{ models: Record<id, ModelPricingEntry>, ok: true }`.
- `apps/client/src/hooks/use-model-pricing.ts` fetches
  `/api/models?ids=<SUPPORTED_MODEL_IDS>` once per session (module-level
  `cached`), returns `Record<string, LandingModelPricing> | undefined`.
- `packages/prompt-panel/src/domain.ts`:
  - `LandingModelPricing` mirrors the server entry type.
  - `VISION_CAPABLE_IDS = new Set(VISION_MODEL_OPTIONS.map(o => o.id))` and
    `syncedVisionModel(textModel)` reads it; `selectLandingModel` /
    `syncLandingModels` / `resolveLandingModels` enforce the invariant.
- `packages/prompt-panel/src/model-dropdown.tsx` calls
  `selectLandingModel(models, activeRole, option.id)` on row click and
  `syncedVisionModel(models.text)` to disable non-synced vision rows.
  It receives `modelPricing?: Record<string, LandingModelPricing>` (live
  map when loaded) from `apps/client/src/App.tsx` → `PromptPanel` →
  `ModelDropdown` (verify the exact prop drilling before editing — search
  for `modelPricing`).

### Repo conventions to match

- Server slim-catalog entries stay additive-only: existing keys untouched,
  new optional key appended in the object literal (perfectionist sort rules
  order object keys — follow the emitted order).
- Domain module stays transport-free (per `packages/prompt-panel/AGENTS.md`:
  "must not reference app code or `import.meta.env`") — live data enters via
  parameters, never fetches.
- The dropdown's disabled-row pattern is `aria-disabled` + click no-op +
  excluded from roving nav (already implemented; reuse).

## Commands you will need

| Purpose    | Command                                                  | Expected on success |
|------------|----------------------------------------------------------|---------------------|
| Typecheck  | `pnpm run typecheck`                                     | exit 0              |
| Lint       | `pnpm run lint`                                          | exit 0              |
| Server tests | `pnpm --filter @workspace/server test -- --run model-catalog 2>&1 \| tail -15` | pass |
| Panel tests  | `pnpm --filter @workspace/prompt-panel test`             | all pass            |
| Client tests | `pnpm --filter @workspace/client test`                   | all pass            |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/model-catalog.ts` — parse + expose `inputModalities`.
- `apps/server/src/model-catalog.test.ts` — parser test for the new field.
- `packages/prompt-panel/src/domain.ts` — `LandingModelPricing` type +
  capability-aware sync helpers (accept an optional override set).
- `packages/prompt-panel/src/domain.test.ts` — sync tests with an override set.
- `packages/prompt-panel/src/model-dropdown.tsx` — prefer live modalities
  when the pricing/capability map carries them.
- `apps/client/src/hooks/use-model-pricing.ts` — type only (entry gains
  the optional field; no fetch-logic change).
- `apps/server/src/index.ts` — only if the response needs a shape tweak
  (it shouldn't — entries flow through).

**Out of scope** (do NOT touch):
- `apps/server/src/mastra/lib/model-capabilities.ts` — the server's own
  direct-mode check stays as-is (it already fetches the same catalog).
- `resolveLandingModels` restore path — it stays on the STATIC fallback
  set (documented below why); do not make project restore async.
- `getImageModelPricing` enrichment — image-gen-only models don't
  participate in the text/vision sync.
- `apps/server/AGENTS.md` + `packages/prompt-panel/AGENTS.md` — update
  the `/api/models` shape bullet and the vision-sync bullet respectively
  (both one-phrase edits, included in Steps).

## Git workflow

- Branch: `advisor/012-live-modalities-picker`.
- Commit message style (match repo): e.g.
  `feat(server,client,prompt-panel): drive vision-sync from live catalog modalities`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Server parses + returns `inputModalities`

In `apps/server/src/model-catalog.ts`:

1. `OpenRouterModelEntry` gains
   `architecture?: { input_modalities?: string[] }`.
2. `ModelPricingEntry` gains `inputModalities?: string[]` (lowercased).
3. `parseModelPricing` maps
   `entry.architecture?.input_modalities?.map(m => m.toLowerCase())` into
   the entry (omitted when absent/empty), alongside the existing
   `cacheRead`/`imageOutput` spreads.

Add a parser test in `model-catalog.test.ts` next to the existing
`parseModelPricing` cases: an entry with
`architecture: { input_modalities: ['text', 'image'] }` yields
`inputModalities: ['text', 'image']`; an entry without `architecture`
yields no `inputModalities` key.

**Verify**: `pnpm --filter @workspace/server test -- --run model-catalog 2>&1 | tail -15`
→ pass. `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Domain accepts a live capability override

In `packages/prompt-panel/src/domain.ts`:

1. `LandingModelPricing` gains `inputModalities?: string[]`.
2. Add:
   ```ts
   /** Derive the vision-capable id set from a live pricing/capability map
    *  (`/api/models` entries carrying `inputModalities`). Returns undefined
    *  when no entry carries modalities — callers fall back to the static
    *  option list. */
   export function liveCapableIds(
     pricing: Record<string, LandingModelPricing> | undefined,
   ): Set<string> | undefined {
     if (!pricing) return undefined
     const ids = new Set<string>()
     for (const [id, entry] of Object.entries(pricing)) {
       if (entry.inputModalities?.includes('image')) ids.add(id)
     }
     return ids.size > 0 ? ids : undefined
   }
   ```
3. Widen the sync helpers to accept an optional override:
   `syncedVisionModel(textModel, capableIds = VISION_CAPABLE_IDS)`,
   `syncLandingModels(models, capableIds?)`,
   `selectLandingModel(models, role, optionId, capableIds?)` — default
   parameter keeps every existing call site + test working unchanged.
   (`resolveLandingModels` intentionally NOT widened — restore stays
   static; the dropdown corrects on first interaction. Document this in
   the helper's JSDoc.)

Add `domain.test.ts` cases: `liveCapableIds` on a map with/without
modalities; `selectLandingModel` with an override set containing an id
absent from `VISION_MODEL_OPTIONS` syncs vision to it (the Grok-4.5-class
case, without depending on that model being in the options).

**Verify**: `pnpm --filter @workspace/prompt-panel test` → all pass
(old + new). `pnpm --filter @workspace/prompt-panel typecheck` → exit 0.

### Step 3: Dropdown prefers live capabilities

In `packages/prompt-panel/src/model-dropdown.tsx`:

1. At the top of `ModelDropdown`, derive:
   `const capableIds = liveCapableIds(modelPricing)`.
2. Pass it into both call sites: `syncedVisionModel(models.text,
   capableIds)` and `selectLandingModel(models, activeRole, option.id,
   capableIds)`.
3. Everything else (row disabling, nav exclusion) works unchanged.

In `apps/client/src/hooks/use-model-pricing.ts`: no logic change — the
`LandingModelPricing` type now carries the field through. (Confirm the
server actually emits it for the picker's ids: manual check
`curl "http://127.0.0.1:3001/api/models?ids=x-ai/grok-4.5"` shows
`"inputModalities":["text","image","file"]` — needs the dev server
running; skip if unavailable, the unit tests cover the shape.)

**Verify**: `pnpm --filter @workspace/client test` + 
`pnpm --filter @workspace/prompt-panel test` → all pass.

### Step 4: DOX one-phrase updates

- `apps/server/AGENTS.md` `/api/models` bullet: add `inputModalities?`
  to the entry shape list.
- `packages/prompt-panel/AGENTS.md` vision-sync bullet: capability set is
  "live `/api/models` `inputModalities` when loaded (preferred), static
  `VISION_MODEL_OPTIONS` membership as fallback; restore path
  (`resolveLandingModels`) always uses the static fallback".

**Verify**: `grep -n "inputModalities" apps/server/AGENTS.md packages/prompt-panel/AGENTS.md`
→ one match each.

### Step 5: Full verification + scope

**Verify**: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build` → all exit 0. `git status --short` lists ONLY in-scope
files.

## Test plan

- Server: `parseModelPricing` modality mapping (with/without architecture).
- Domain: `liveCapableIds` (undefined map, empty map, map with image
  entries); `selectLandingModel` + override syncs a non-option model;
  default (no override) behavior unchanged — existing tests prove this.
- No new dropdown component test harness exists in the package — domain
  tests carry the logic; do not build one here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "inputModalities" apps/server/src/model-catalog.ts` shows type + parser wiring
- [ ] `grep -n "inputModalities\|liveCapableIds" packages/prompt-panel/src/domain.ts` shows type + helper
- [ ] `grep -n "capableIds" packages/prompt-panel/src/model-dropdown.tsx` shows both call sites widened
- [ ] All commands in "Commands you will need" exit 0 / pass
- [ ] Both DOX files updated (Step 4 greps)
- [ ] `git status --short` lists ONLY in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The upstream catalog entries for the picker's ids do NOT carry
  `architecture.input_modalities` anymore (spot-check
  `curl -s https://openrouter.ai/api/v1/models | head -c 2000`). The
  whole premise changes; report.
- Widening `selectLandingModel` breaks existing `domain.test.ts` cases —
  that means the default-parameter path changed semantics; fix the
  default, not the tests.
- `modelPricing` does not actually reach `ModelDropdown` as a prop (the
  drilling changed). Report the new prop path and wire through it.
- `resolveLandingModels` seems to need live data (e.g. reviewer insists
  restored projects must sync before first render). That requires an
  async restore — STOP and report instead of bolting it on; it's a
  design decision.

## Maintenance notes

- After this lands, adding a brand-new vision-capable model to
  TEXT_MODEL_OPTIONS auto-syncs vision once the live map loads — but the
  STATIC fallback still matters pre-load and for restore, so new
  vision-capable text models should STILL also be added to
  VISION_MODEL_OPTIONS (now as UX completeness, not capability truth).
- The server has two in-process catalog caches (`model-catalog.ts` for
  pricing+modalities, `mastra/lib/model-capabilities.ts` for direct mode)
  fetching the same upstream document. A future consolidation could share
  one cache; not worth it here (different TTL needs, both cheap).
- Reviewer: server diff = one interface field + one parse spread + one
  test; client diff = additive helper + two widened call sites. Reject
  any change to enrichment (`getImageModelPricing`) or restore semantics.
