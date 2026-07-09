# Plan 016: Bound the image-generation and scraped-image fetches with timeout + retry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c305fd0b..HEAD -- apps/server/src/mastra/lib/vision-fetch.ts apps/server/src/mastra/lib/image-ocr.ts apps/server/src/mastra/tools/generate-image.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / perf
- **Planned at**: commit `c305fd0b`, 2026-07-09
- **Issue**: _(omit — not published via `--issues`)_

## Why this matters

Three production `fetch(` sites talk to the network. Only one — the OpenRouter
vision/chat OCR call — is bounded: plan 013 wrapped it in
`fetchVisionCompletion` (a 30s `AbortController` timeout + 3-attempt retry on
5xx/AbortError, 4xx returned unretried) because "the bare `fetch` had no
timeout/retry (latent hang risk on slow Z.AI vision)."

Two sibling sites are still bare `fetch` calls with the same hang risk:

1. **Image generation** (`generate-image.ts`) POSTs to OpenRouter's
   `/api/v1/images` endpoint with no timeout. Seedream 4.5 image generation is
   slow (routinely 15–30s+); a hung or abandoned provider connection blocks the
   agent's `execute` indefinitely. The per-run cost cap (`AGENT_MAX_COST_USD`)
   cannot help — cost is accrued _after_ the response returns, and a Stop click
   / cost-cap abort cancels the Mastra stream but not this in-flight tool fetch.
2. **Scraped-image download** (`image-ocr.ts` `fetchAsDataUrl`) GETs arbitrary
   remote image hosts discovered during a `scrape`. A slow/hung external host
   blocks the whole OCR batch (the calls run in a `Promise.all`).

This plan consolidates the bounded-fetch abstraction (rename the generic helper
off its vision-only name) and routes both sites through it, completing the
hardening plan 013 started. Behavior for a healthy provider is unchanged; only
the slow/hung failure mode improves (fail-fast with a clear reason instead of
hanging forever).

## Current state

### The bounded helper — `apps/server/src/mastra/lib/vision-fetch.ts`

It is already generic in shape (takes `url` + `RequestInit` + options, returns
`{ ok: true, response } | { ok: false, reason }`). Only its _name_ and reason
strings are vision-specific:

```ts
const OCR_TIMEOUT_MS = 30_000
const OCR_MAX_ATTEMPTS = 3
const OCR_RETRY_BASE_DELAY_MS = 500

export interface VisionFetchOptions {
  baseDelayMs?: number
  maxAttempts?: number
  timeoutMs?: number
}

export type VisionFetchResult =
  | { ok: false; reason: string }
  | { ok: true; response: Response }

export async function fetchVisionCompletion(
  url: string,
  init: RequestInit,
  options: VisionFetchOptions = {},
): Promise<VisionFetchResult> {
  const timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS
  // ... per-attempt AbortController(timeout); retry on 5xx + AbortError;
  //     4xx returned immediately; on retry-exhaustion a 5xx is still returned.
}
```

Its reason strings are hardcoded `"OpenRouter vision timed out..."` /
`"OpenRouter vision fetch failed..."` / `"OpenRouter vision request failed"`.

### Image generation — `apps/server/src/mastra/tools/generate-image.ts`

The bare fetch (inside `execute`, after the `OPENROUTER_API_KEY` guard):

```ts
const response = await fetch(config.openrouter.imageApiUrl, {
  body: JSON.stringify({
    aspect_ratio: aspectRatio ?? '16:9',
    model,
    prompt,
  }),
  headers: {
    Authorization: `Bearer ${config.openrouter.apiKey}`,
    'Content-Type': 'application/json',
    'X-OpenRouter-Metadata': 'enabled',
  },
  method: 'POST',
})

if (!response.ok) {
  const text = await response.text().catch(() => '')
  return {
    cost: 0,
    imagesGenerated: 0,
    ok: false,
    prompt,
    reason: `OpenRouter image API error (${response.status}): ${text.slice(0, 200)}`,
    url: null,
  }
}

const json = (await response.json()) as OpenRouterImageResponse
```

### Scraped-image download — `apps/server/src/mastra/lib/image-ocr.ts`

```ts
/** Fetch an image and return a base64 data URL suitable for OpenRouter vision. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  // ... media-type detection from content-type header or magic bytes ...
  return dataUrlFromBuffer(buffer, mediaType)
}
```

`fetchAsDataUrl` is called from `loadImageInput`, which is invoked per scraped
image inside a `Promise.all` in `ocrImageInputs`, each wrapped in its own
try/catch that turns a failure into a `FailedImageRef` (summarized in the final
`reason`). So a bounded timeout fails one image fast instead of hanging the
batch; the existing "no images loaded" summary path already handles failures.

### Repo conventions to match

- Cost is provider-reported only (`lib/cost.ts`); do **not** add token/estimate
  math. This plan does not touch cost.
- The server enforces 90% line coverage (`pnpm --filter @workspace/server test`).
  Match the existing test style in `image-ocr.test.ts`: `vi.stubGlobal('fetch', …)`
  with a mock that honors `init.signal` (reject with an `AbortError`-named Error
  on abort) — see the existing `fetchVisionCompletion` "times out, retries, and
  surfaces a timeout reason when fetch hangs" test for the exact pattern.
- Config/format is Oxfmt; the shared factory is `packages/oxfmt-config`. Lint is
  Oxlint (`packages/oxlint-config`); the server allows `no-explicit-any` etc.
  Don't introduce `any`.

## Commands you will need

| Purpose    | Command                                                  | Expected on success |
|------------|----------------------------------------------------------|---------------------|
| Install    | `pnpm install`                                           | exit 0              |
| Typecheck  | `pnpm run typecheck`                                     | exit 0, no errors   |
| Lint       | `pnpm run lint`                                          | exit 0              |
| Format     | `pnpm run format:check`                                  | exit 0              |
| Tests (all)| `pnpm run test`                                          | all pass            |
| Focused    | `pnpm --filter @workspace/server test -- --run image-ocr`| all pass            |
| Focused    | `pnpm --filter @workspace/server test -- --run external-tools` | all pass       |

## Scope

**In scope** (the only files you should modify):

- `apps/server/src/mastra/lib/vision-fetch.ts` → **rename to** `bounded-fetch.ts`; rename the export + types and add a `label` option.
- `apps/server/src/mastra/lib/image-ocr.ts` — import the renamed helper; route `fetchAsDataUrl` through it.
- `apps/server/src/mastra/lib/image-ocr.test.ts` — update imports; add timeout tests.
- `apps/server/src/mastra/tools/generate-image.ts` — route the image-API fetch through the helper; add timeout tests.
- `apps/server/src/mastra/tools/external-tools.test.ts` — add image-gen timeout/retry tests.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/mastra/route.ts` — the stream loop and cost accounting. No change to SSE mapping.
- `lib/cost.ts`, `lib/image-store.ts` — cost and storage are unaffected.
- The Mastra tool `abortSignal` wiring (threading the stream's `controller.signal` into tool `execute` so a Stop click cancels in-flight fetches). That is a larger, separate Mastra-level change; see "Maintenance notes". Do not attempt it here.
- The vision OCR call site's _behavior_ (`ocrImageInputs` POST). It must keep working identically; only its import name changes.

## Git workflow

- Branch: `advisor/016-bounded-fetch`
- Conventional commits, one per step, e.g. `refactor(lib): rename fetchVisionCompletion → boundedFetch; add label option`. Match `git log` style (recent examples: `fix(image-ocr): bound OCR fetch with timeout + retry [plan 013]`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rename the helper to `boundedFetch` and add a `label` option

Rename the file and its public surface so a generic, multi-consumer helper
isn't misnamed. Rename _only_ — do not change the algorithm.

- `git mv apps/server/src/mastra/lib/vision-fetch.ts apps/server/src/mastra/lib/bounded-fetch.ts`
- In the new `bounded-fetch.ts`:
  - Rename export `fetchVisionCompletion` → `boundedFetch`.
  - Rename types `VisionFetchOptions` → `BoundedFetchOptions`, `VisionFetchResult` → `BoundedFetchResult`.
  - Keep the module-private constants (`OCR_TIMEOUT_MS`, `OCR_MAX_ATTEMPTS`, `OCR_RETRY_BASE_DELAY_MS`) and the algorithm exactly as-is. (Renaming these constants is optional churn; leaving them is fine — add a one-line comment that they are the defaults for the helper.)
  - Add an optional `label?: string` to `BoundedFetchOptions` (default `'OpenRouter request'`). Use it in the three reason strings so a timeout/failure names the calling path accurately, e.g.:
    - timeout-after-retries → `` `${label} timed out after ${maxAttempts} attempts (${timeoutMs / 1000}s each)` ``
    - fetch-throws-after-retries → `` `${label} fetch failed after ${maxAttempts} attempts: ${errorMessage(error)}` ``
    - fall-through → `` `${label} request failed` ``
- Update `apps/server/src/mastra/lib/image-ocr.ts` to import from `./bounded-fetch.ts` and call `boundedFetch(...)` instead of `fetchVisionCompletion(...)`. Pass `label: 'OpenRouter vision'` at this call site so its timeout reasons stay vision-specific (preserves existing behavior/messages).
- Update `apps/server/src/mastra/lib/image-ocr.test.ts`: the `describe('fetchVisionCompletion', ...)` block becomes `describe('boundedFetch', ...)` and imports `boundedFetch` from `./bounded-fetch.ts`. **Do not change the test bodies** — they must still pass unchanged (the timeout test asserts `/timed out/i`, which the `label` does not affect).

**Verify**:
- `grep -rn "fetchVisionCompletion\|VisionFetchOptions\|VisionFetchResult\|vision-fetch" apps/server/src` → **no matches** (everything renamed/migrated).
- `pnpm --filter @workspace/server test -- --run image-ocr` → all pass (the renamed `boundedFetch` tests + existing OCR tests).
- `pnpm run typecheck` → exit 0.

### Step 2: Route image generation through `boundedFetch`

In `apps/server/src/mastra/tools/generate-image.ts`, replace the bare `fetch`
block with a bounded call. Keep the exact request body/headers and the existing
error-shape contract (`{ cost: 0, imagesGenerated: 0, ok: false, prompt, reason, url: null }`).

Target shape:

```ts
const fetched = await boundedFetch(
  config.openrouter.imageApiUrl,
  {
    body: JSON.stringify({
      aspect_ratio: aspectRatio ?? '16:9',
      model,
      prompt,
    }),
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Metadata': 'enabled',
    },
    method: 'POST',
  },
  { label: 'OpenRouter image generation' },
)

if (!fetched.ok) {
  return {
    cost: 0,
    imagesGenerated: 0,
    ok: false,
    prompt,
    reason: fetched.reason,
    url: null,
  }
}

const response = fetched.response
if (!response.ok) {
  const text = await response.text().catch(() => '')
  return {
    cost: 0,
    imagesGenerated: 0,
    ok: false,
    prompt,
    reason: `OpenRouter image API error (${response.status}): ${text.slice(0, 200)}`,
    url: null,
  }
}

const json = (await response.json()) as OpenRouterImageResponse
```

(Use the helper's default timeout/retry — 30s × 3 — for the paid OpenRouter
image API, consistent with the vision call. Do not pass custom `timeoutMs` here.)

**Verify**:
- `pnpm --filter @workspace/server test -- --run external-tools` → all existing `createGenerateImageTool` tests still pass (success path, media-type detection, 502/empty failures). The existing tests stub `globalThis.fetch`; the helper calls the same global, so they keep working.
- `pnpm run typecheck` → exit 0.

### Step 3: Route scraped-image download through `boundedFetch`

In `apps/server/src/mastra/lib/image-ocr.ts`, update `fetchAsDataUrl`:

```ts
async function fetchAsDataUrl(url: string): Promise<string> {
  const fetched = await boundedFetch(
    url,
    { method: 'GET' },
    // External CDN images: shorter timeout, fewer retries than the paid API,
    // so one slow host doesn't stall the OCR batch for 90s.
    { label: 'image download', maxAttempts: 2, timeoutMs: 15_000 },
  )
  if (!fetched.ok) {
    throw new Error(`${fetched.reason}: ${url}`)
  }
  const response = fetched.response
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  // ... unchanged media-type detection + dataUrlFromBuffer ...
}
```

Keep the rest of `fetchAsDataUrl` (header content-type parsing, magic-byte
detection, `isSupportedImageMediaType` check) unchanged.

**Verify**:
- `pnpm --filter @workspace/server test -- --run image-ocr` → the existing `ocrImages` tests still pass:
  - "preserves URL input behavior by fetching image URLs..." (200 webp) — still ok.
  - "summarizes URL fetch failures when no images load" (404) — still ok (4xx returned unretried → `Failed to fetch image (404)`). Note: the reason now additionally carries the bounded-fetch GET label only on the timeout path; the 404 path still throws the existing `Failed to fetch image (404)` message, so this assertion holds.
  - "rejects fetched URLs without supported image media types" (text/plain 200) — still ok.
- `pnpm run typecheck` → exit 0.

### Step 4: Add timeout/retry regression tests

Add focused tests proving the new bounds actually fire. Follow the existing
abort-honoring fetch mock pattern in `image-ocr.test.ts` (the
`fetchVisionCompletion`→`boundedFetch` "times out" test).

In `apps/server/src/mastra/tools/external-tools.test.ts`, inside the existing
`describe('createGenerateImageTool', ...)`:

- **"fails fast with a timeout reason when the image API hangs"** — stub `fetch` with a signal-honoring mock that never resolves (rejects `AbortError` on abort), call `tool.execute` with a valid prompt + `OPENROUTER_API_KEY` set, assert the result is `{ ok: false }` and `reason` matches `/timed out/i`, and that `fetch` was attempted 3 times. Use `{ timeoutMs: 5 }` is not possible here (the call site doesn't expose options), so assert on _behavior_: the mock rejects on abort, and the helper's default retries 3×. (If asserting the exact attempt count is flaky in this file's `loadGenerateImageTool` env-stub harness, assert instead that `result.ok === false` and `result.reason` matches `/timed out|image generation/i` and that `fetch` was called more than once.) See STOP conditions if the harness complicates this.
- **"retries image generation on a transient 5xx"** — stub `fetch` to return 503 once then a valid 200 image JSON; assert `ok: true` and `fetch` called twice.

In `apps/server/src/mastra/lib/image-ocr.test.ts`, inside `describe('ocrImages', ...)`:

- **"fails fast when a scraped image URL hangs"** — stub `fetch` with the signal-honoring never-resolve mock; call `ocrImages(['https://example.test/slow.png'])`; assert `{ ok: false }`, `reason` mentions the URL, and `fetch` was attempted exactly 2 times (the `maxAttempts: 2` tuned for downloads). Use `vi.useFakeTimers()` if needed to keep the 15s timeout from slowing the suite — but prefer the abort-honoring mock (rejects on abort) which resolves immediately on abort without real timers.

**Verify**:
- `pnpm --filter @workspace/server test -- --run image-ocr` → all pass, incl. the new scraped-image timeout test.
- `pnpm --filter @workspace/server test -- --run external-tools` → all pass, incl. the new image-gen timeout + retry tests.
- `pnpm run test` → all pass (no coverage drop; the server's 90% gate holds).

## Test plan

- New tests (Step 4): image-gen hang → timeout reason + retries; image-gen 5xx → retry-then-success; scraped-image hang → fail-fast with URL in reason, 2 attempts.
- Structural pattern: copy the existing abort-honoring `fetch` mock from `image-ocr.test.ts`'s `boundedFetch` "times out" test.
- Existing tests that must stay green: every test in `image-ocr.test.ts` (OCR happy paths, dedupe, media-type rejection, `boundedFetch` rename) and every `createGenerateImageTool` / `createScrapeTool` test in `external-tools.test.ts`.
- Verification: `pnpm run test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "fetchVisionCompletion\|VisionFetchOptions\|VisionFetchResult\|from.*vision-fetch" apps/server/src` returns **no matches**.
- [ ] `grep -n "await fetch(" apps/server/src/mastra/tools/generate-image.ts apps/server/src/mastra/lib/image-ocr.ts` shows **no bare `await fetch(`** in `generate-image.ts`, and `fetchAsDataUrl` inside `image-ocr.ts` calls `boundedFetch` (the only remaining direct `fetch` in `image-ocr.ts` should be none in these two functions).
- [ ] `pnpm run typecheck` exits 0.
- [ ] `pnpm run lint` exits 0.
- [ ] `pnpm run format:check` exits 0.
- [ ] `pnpm run test` exits 0; new timeout/retry tests for image-gen (2) and scraped-image (1) exist and pass.
- [ ] No files outside the in-scope list are modified (`git status`).

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written — e.g. `generate-image.ts` already wraps its fetch, or the helper was already renamed).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file (e.g. `route.ts`, or Mastra tool-execute signatures for abort threading).
- The `external-tools.test.ts` `loadGenerateImageTool` harness makes the image-gen "called more than once / timed out" assertion unreliable — report the harness limitation rather than writing a misleading test. (A behavior-only assertion — `ok: false` + reason matches `/timed out|image generation/i` — is an acceptable fallback.)
- The default 30s×3 retry for image generation proves too slow in your judgment (e.g. it makes the existing `createGenerateImageTool` 502 test slow) — report it; do not silently lower the defaults.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Abort-threading is deliberately out of scope.** A Stop click or cost-cap abort cancels the Mastra stream's `controller.signal`, but tool `execute` functions still own their own `AbortController` for the _timeout_ and do not receive the stream signal. So an in-flight `generate_image` / vision fetch is bounded in _duration_ but not cancellable on user demand. Threading the stream abortSignal into tool `execute` is a Mastra-level wiring change; track it as a separate follow-up.
- If a new outbound `fetch` to OpenRouter or a remote host is added, route it through `boundedFetch` rather than calling `fetch` directly — that is now the project convention. A grep for `await fetch(` under `apps/server/src` should turn up only the helper's own internal call.
- The scraped-image download intentionally uses a shorter timeout (15s) and fewer retries (2) than the paid OpenRouter calls (30s×3): external CDN images are flaky and one slow host should not stall the OCR batch. If scrape OCR starts dropping too many valid images, raise these before disabling retry.
- Watch in review: the rename touches a test-file `describe` name and imports; confirm no stale `vision-fetch` import remains anywhere (the grep gate enforces this).
