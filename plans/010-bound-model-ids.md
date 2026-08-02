# Plan 010: Bound `/api/models?ids=` to stop upstream fetch amplification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09236e63 -- apps/server/src/index.ts apps/server/src/index.test.ts apps/server/src/model-catalog.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (minor) / correctness
- **Planned at**: commit `09236e63`, 2026-08-02

## Why this matters

`GET /api/models?ids=a,b,c,...` accepts an unbounded list of model ids. For
each id that is absent from the chat catalog, the server fires an upstream
fetch to OpenRouter's images API (`/api/v1/images/models/:id/endpoints`) —
all in parallel via `Promise.all`. A caller can pass thousands of ids and
make the server spray thousands of outbound requests (request amplification),
and the per-id cache is keyed by attacker-chosen strings so it never
dedupes junk ids. The first-party client sends ~25 ids. Bounding the list
to a generous cap (64) closes the vector without affecting the real client.

## Current state

`apps/server/src/index.ts`, `handleModelCatalog` (lines ~337-365):

```ts
async function handleModelCatalog(
  request: IncomingMessage,
  response: ServerResponse,
) {
  // `?ids=a/b,c/d` scopes the response to the app's supported models (the
  // picker's option ids); without it the full slim catalog is returned.
  const idsParam = new URL(
    request.url ?? '/',
    `http://${request.headers.host}`,
  ).searchParams.get('ids')
  const ids = idsParam
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  try {
    const catalog = await getModelPricing()
    const models: ModelPricingCatalog = ids?.length
      ? filterModelPricing(catalog, ids)
      : catalog
    // Image-generation-only models (Seedream, GPT Image, Grok Imagine) are
    // absent from the chat catalog — enrich them from the images API so the
    // picker can price every image option. Failures skip the id silently.
    const chatAbsent = (ids ?? [])
      .filter((id) => !(id in models))
    if (chatAbsent.length > 0) {
      const imagePricing = await getImageModelPricing(chatAbsent)
      for (const [id, pricing] of Object.entries(imagePricing)) {
        models[id] = { input: 0, output: 0, ...pricing }
      }
    }
    sendJson(response, 200, { models, ok: true })
  } catch (error) {
    sendJson(response, 502, { error: errorMessage(error), ok: false })
  }
}
```

The amplification path: `getImageModelPricing(chatAbsent)` in
`apps/server/src/model-catalog.ts` fans out one `boundedFetch` per id via
`Promise.all`, with per-id results cached 5 min — junk ids are
negative-cached, but an attacker rotating ids bypasses that.

Existing bounded-body precedent in the same file: JSON bodies are capped
(`MAX_PROJECT_JSON_BODY_SIZE` etc., with a `413` JSON on overflow — see
`readJsonObject` usage). A fixed-string `400` mirrors that pattern.

The first-party client's id list comes from
`apps/client/src/hooks/use-model-pricing.ts` (`SUPPORTED_MODEL_IDS`, ~25
entries derived from `LANDING_MODEL_GROUPS`). A 64 cap is 2.5× headroom.

### Repo conventions to match

- Tuning constants in `index.ts`-adjacent server code use `UPPER_SNAKE_CASE`
  (e.g. `MAX_PROJECT_JSON_BODY_SIZE`).
- Error responses use `sendJson(response, <status>, { error: '<fixed
  string>', ok: false })` — never raw exception text (see the 413/403
  branches in the same file).

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass            |
| Focused    | `pnpm --filter @workspace/server test -- --run index 2>&1 \| tail -15` | index tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/index.ts` — add `MAX_MODEL_IDS` + the 400 guard in
  `handleModelCatalog`.
- `apps/server/src/index.test.ts` — add one test: >64 ids → 400 with the
  fixed message; ≤64 ids still 200.

**Out of scope** (do NOT touch):
- `apps/server/src/model-catalog.ts` — the per-id cache + enrichment logic
  is correct once the input is bounded.
- `apps/client/src/hooks/use-model-pricing.ts` — the client already sends a
  small static list; no change needed.
- `errorMessage` / the 502 path — plan 008 documents why the helper stays.

## Git workflow

- Branch: `advisor/010-bound-model-ids`.
- Commit message style (match repo): e.g.
  `fix(server): cap /api/models ids to bound upstream image-pricing fetches`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the cap + 400 guard

In `apps/server/src/index.ts`:

1. Add near the other `MAX_*` constants (search `MAX_PROJECT_JSON_BODY_SIZE`
   for the neighborhood):
   ```ts
   /** Upper bound on `/api/models?ids=` entries — each chat-catalog-absent id
    *  triggers one upstream images-API fetch, so an unbounded list is a
    *  request-amplification vector. The first-party client sends ~25. */
   const MAX_MODEL_IDS = 64
   ```
2. In `handleModelCatalog`, right after the `ids` parse (before the `try`),
   add:
   ```ts
   if (ids && ids.length > MAX_MODEL_IDS) {
     sendJson(response, 400, {
       error: `Too many model ids (max ${MAX_MODEL_IDS}).`,
       ok: false,
     })
     return
   }
   ```

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Add the regression test

In `apps/server/src/index.test.ts`, find the existing `/api/models` tests
(search for `api/models`) or the `withServer` helper pattern. Add a test
that:

1. Builds a query string with 65 comma-separated ids
   (`Array.from({ length: 65 }, (_, i) => `m/${i}`).join(',')`).
2. GETs `/api/models?ids=<that>` inside `withServer`.
3. Asserts `response.status === 400` and the JSON body equals
   `{ error: 'Too many model ids (max 64).', ok: false }`.
4. Companion assertion (same test or a second one): a 2-id request
   (`z-ai/glm-5.2,unknown/x`) is NOT 400 (status 200, `ok: true`) — mock
   `fetch` for the upstream catalog as the existing model-catalog/index
   tests do (read `apps/server/src/model-catalog.test.ts` for the
   `catalogResponse` fetch-stub pattern, or follow however the existing
   index tests stub upstream fetches).

**Verify**: `pnpm --filter @workspace/server test -- --run index 2>&1 | tail -15`
→ new test(s) pass, existing index tests pass.

### Step 3: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0; baseline + 1 (or +2) tests.

### Step 4: Confirm scope

**Verify**: `git status --short` lists ONLY `apps/server/src/index.ts` and
`apps/server/src/index.test.ts`.

## Test plan

- New test(s) in `apps/server/src/index.test.ts`: 65 ids → 400 fixed body;
  small id list → 200 (enrichment still runs).
- Structural pattern: existing `withServer` tests in the same file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; new 400 test exists and passes
- [ ] `grep -n "MAX_MODEL_IDS" apps/server/src/index.ts` returns at least 2 matches (constant + guard)
- [ ] `git status --short` lists ONLY the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `handleModelCatalog` has drifted from the excerpt (e.g. enrichment moved
  into `model-catalog.ts`). Apply the same guard at the new parse site and
  report the change in shape.
- The first-party client sends more than 64 ids (check
  `SUPPORTED_MODEL_IDS` length in
  `apps/client/src/hooks/use-model-pricing.ts`). If it does, raise the cap
  to 2.5× the real count and note it.
- The existing index tests have no upstream-fetch stub for `/api/models`,
  making the 200-path assertion flaky. In that case assert only the 400
  path (which needs no upstream) and note the omission.

## Maintenance notes

- If the picker ever supports user-typed model ids, revisit the cap (it is
  sized for the static option list).
- The per-id enrichment cache in `model-catalog.ts` is unbounded in ENTRY
  COUNT over time (one entry per distinct id seen, 5-min TTL but never
  size-capped). With the 64-id request cap this is a slow leak at worst;
  if it ever matters, an LRU bound on `imagePricingCache` mirrors plan
  003's pattern. Not worth doing now.
- Reviewer: the diff should be one constant, one guard, one/two tests.
  Reject any change to enrichment logic or the 502 path.
