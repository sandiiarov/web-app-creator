# Plan 004: Block SSRF and resource amplification in scrape-image OCR

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only files listed in Scope. If a STOP condition occurs, stop and report; do not improvise. Make exactly one commit for this plan. When done, update only plan 004's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9b8d66b6..HEAD -- apps/server/src/mastra/tools/scrape.ts apps/server/src/mastra/tools/external-tools.test.ts apps/server/src/mastra/lib/image-ocr.ts apps/server/src/mastra/lib/image-ocr.test.ts apps/server/src/mastra/AGENTS.md`
>
> Plan 003 must already be `DONE`; its only expected overlap is `apps/server/src/mastra/AGENTS.md` through parent documentation updates. Preserve all prior DOX contracts. For source/test files, compare Current state against live code and STOP on a mismatch. New files named in Scope have no pre-existing drift. `plans/README.md` is excluded because the status ledger is expected to change.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-local-origin-api-boundary.md`
- **Category**: security / perf
- **Planned at**: commit `9b8d66b6`, 2026-07-11

## Why this matters

After Firecrawl returns a page, the server extracts image URLs and downloads them itself for vision OCR. It currently accepts any HTTP(S) host with an image-looking path, follows redirects implicitly, reads the full response into memory, and processes every unique image concurrently. A scraped page can therefore make the server contact private network targets or amplify memory/network/model usage.

## Current state

Applicable contracts:

- `apps/server/src/mastra/AGENTS.md` requires every outbound remote `fetch` to be bounded and names scraped-image downloads as 15 seconds × 2 attempts.
- `boundedFetch` is shared by OpenRouter and image downloads. Do not impose public-internet-only restrictions on OpenRouter URLs because `OPENROUTER_API_URL` is an operator-controlled provider endpoint.
- Tests for URL-image loading and `boundedFetch` live in `apps/server/src/mastra/lib/image-ocr.test.ts`. Scrape collection behavior is tested through the mocked Firecrawl/OCR path in `apps/server/src/mastra/tools/external-tools.test.ts`.
- No new dependency is needed; use `node:dns/promises`, `node:net`, `URL`, and Web `Response` streams.

Scrape output is trusted for local fetch after only extension/scheme checks:

```ts
// apps/server/src/mastra/tools/scrape.ts:152-160
const images = collectImageUrls({
  baseUrl: url,
  brandingLogo: typeof branding?.logo === 'string' ? branding.logo : null,
  markdown,
  metadata: doc.metadata,
  rawImages: doc.images ?? [],
})
const imageOcr = await ocrImages(images, undefined, visionModel)
```

```ts
// apps/server/src/mastra/tools/scrape.ts:286-294
function isLikelyImageUrl(imageUrl: string): boolean {
  try {
    const { pathname, protocol } = new URL(imageUrl)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    return /\.(avif|gif|jpe?g|png|webp)$/i.test(pathname)
  } catch {
    return false
  }
}
```

Image loading follows redirects and buffers without a byte cap:

```ts
// apps/server/src/mastra/lib/image-ocr.ts:315-351
const fetched = await boundedFetch(
  url,
  { method: 'GET' },
  { label: 'image download', maxAttempts: 2, signal, timeoutMs: 15_000 },
)
// ...
const buffer = Buffer.from(await response.arrayBuffer())
```

`ocrImageInputs` maps all normalized inputs through one `Promise.all` (`image-ocr.ts:126-143`). Uploaded data URLs are separately bounded by plan 002; this plan must restrict only URL inputs and scrape fan-out.

## Target contract

- Only absolute `http:` and `https:` image URLs whose host resolves exclusively to public/global IP addresses may be downloaded.
- Reject credentials in URLs, `localhost`/`.localhost`, private, loopback, link-local, unspecified, carrier-grade NAT, benchmarking/documentation-only, and multicast/reserved IPv4/IPv6 ranges. Handle IPv4-mapped IPv6.
- Resolve hostnames immediately before each fetch. Reject the URL if any returned address is non-public.
- Use `redirect: 'manual'`, follow at most 5 redirects, resolve relative `Location` headers against the current URL, and re-run the complete URL/DNS policy before every hop.
- Preserve 15-second × 2-attempt behavior for each hop. Do not alter operator-controlled OpenRouter fetch behavior.
- Reject an image response over 8 MiB. Check a valid `Content-Length` before reading and enforce the same cap while streaming when the header is absent/wrong. Cancel the response body on overflow.
- Process at most 12 unique scrape image URLs. Prioritize the branding logo and metadata image candidates before generic Firecrawl/Markdown images, then preserve first-seen order.
- Individual URL failures remain non-fatal to the OCR batch and appear in the existing summarized failure reason.

A DNS pre-check with a separate default `fetch` resolution cannot mathematically eliminate DNS rebinding between lookup and connection. Do not claim otherwise. The expected scoped implementation blocks direct/private DNS results and revalidates redirects. If the repository requires a strict pin-to-resolved-address guarantee, treat that as a STOP condition because it needs a deliberately selected HTTP dispatcher/dependency and certificate/SNI design.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| URL-policy tests | `pnpm --filter @workspace/server test -- src/mastra/lib/public-http-url.test.ts` | exit 0; all policy tests pass |
| OCR tests | `pnpm --filter @workspace/server test -- src/mastra/lib/image-ocr.test.ts` | exit 0; all OCR/fetch tests pass |
| Tool tests | `pnpm --filter @workspace/server test -- src/mastra/tools/external-tools.test.ts` | exit 0; all tool tests pass |
| Server checks | `pnpm --filter @workspace/server lint && pnpm --filter @workspace/server typecheck` | exit 0, no errors |
| Full gate | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run fallow:dead-code` | every command exits 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Scope

**Implementation files in scope**:

- `apps/server/src/mastra/lib/public-http-url.ts` (new)
- `apps/server/src/mastra/lib/public-http-url.test.ts` (new)
- `apps/server/src/mastra/lib/image-ocr.ts`
- `apps/server/src/mastra/lib/image-ocr.test.ts`
- `apps/server/src/mastra/tools/scrape.ts`
- `apps/server/src/mastra/tools/external-tools.test.ts`
- `apps/server/src/mastra/AGENTS.md`

**Administrative file in scope**:

- `plans/README.md` — update only plan 004's status cell.

**Out of scope**:

- Firecrawl's own remote scrape policy; this plan protects only URLs fetched by this server.
- OpenRouter/image-generation endpoints, operator-configured provider URLs, inbound attachment limits, authentication, proxy support, or a general-purpose HTTP client rewrite.
- Adding an IP parsing/HTTP dispatcher dependency without stopping for review.
- Changing OCR prompts, cost accounting, response schemas, or making one failed scraped image fail the whole tool.

## Git workflow

- Work only after plan 003 is `DONE`.
- Produce exactly one commit: `fix(scrape): block private-network image fetches`.
- Include only files in Scope. Do not push or open a PR.

## Steps

### Step 1: Implement and exhaustively test the public URL policy

Create `public-http-url.ts` as a small server-only module. It should:

1. Parse an absolute URL and reject non-HTTP(S), credentials, fragments if they are not removed before fetch, and local hostnames.
2. Detect literal IP hosts with `isIP` and classify them without DNS.
3. Resolve DNS hostnames using `lookup(hostname, { all: true, verbatim: true })`.
4. Reject empty lookup results and reject the whole host if any address is non-public.
5. Return a normalized `URL` (or void after validation) without logging addresses or request data.
6. Export only the minimum function(s) needed by `image-ocr.ts` and tests.

Create `public-http-url.test.ts`. Use pure address-classification cases and mock `node:dns/promises` for hostname cases. Cover public IPv4 and IPv6 acceptance plus all denied families named in Target contract, including IPv4-mapped IPv6. Cover mixed public/private DNS answers, local hostname aliases, credentials, and unsupported schemes.

Do not perform real DNS/network access in tests.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/mastra/lib/public-http-url.test.ts
pnpm --filter @workspace/server typecheck
```

Expected: policy tests pass; no real network access occurs.

### Step 2: Revalidate every image redirect and bound response bytes

Refactor only the URL branch of `image-ocr.ts`:

1. Before fetching, validate the current URL through `public-http-url.ts`.
2. Call `boundedFetch` with `redirect: 'manual'`.
3. For 3xx responses, require a valid `Location`, resolve it against the current URL, and repeat validation/fetch for at most 5 hops. Detect a redirect loop or exhausted hop budget and return a concise failure.
4. For the final 2xx response, reject a valid `Content-Length` above 8 MiB before reading.
5. Replace `arrayBuffer()` with a bounded stream reader that counts bytes, accumulates only up to 8 MiB, cancels on overflow, and produces one `Buffer` for existing media detection/base64 conversion.
6. Preserve external abort propagation, timeout/retry messages, media detection, 4xx behavior, and per-image failure summarization.

Update `image-ocr.test.ts`. Mock DNS deterministically in the test loader so existing `example.test` tests remain isolated. Add cases for:

- direct local/private destination rejected before `fetch`;
- public hostname accepted;
- redirect to a public URL accepted after a second policy check;
- redirect to a denied destination rejected before the second fetch;
- redirect limit/loop rejection;
- oversized `Content-Length` rejection without consuming the body;
- chunked body crossing 8 MiB is canceled/rejected;
- under-limit image remains converted and sent to OpenRouter;
- external abort and timeout tests still pass.

Use synthetic `ReadableStream` chunks; do not commit large binary fixtures.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/mastra/lib/image-ocr.test.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
```

Expected: all existing and new tests pass; denied redirects never invoke a fetch for the denied target.

### Step 3: Cap and prioritize scrape image candidates

In `scrape.ts`:

1. Add `MAX_SCRAPED_IMAGE_COUNT = 12` near the collection helper.
2. Order candidates as branding logo, metadata image fields, Firecrawl `rawImages`, then Markdown images.
3. Normalize, filter, and deduplicate as today, then stop at 12.
4. Keep `imageCount`, returned `images`, OCR input, and cost accounting aligned to the capped list.

Update the existing scrape test in `external-tools.test.ts` and add a generated-candidate case proving:

- branding/metadata candidates win when more than 12 unique images exist;
- duplicates do not consume slots;
- exactly the returned/capped list is passed to `ocrImages`;
- non-HTTP(S), data URLs, and non-image-looking paths remain filtered.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/mastra/tools/external-tools.test.ts
```

Expected: all tests pass and OCR receives no more than 12 URLs.

### Step 4: Synchronize DOX, run all gates, and commit

Update `apps/server/src/mastra/AGENTS.md` where it describes bounded remote fetches. Record public-only scrape images, DNS/redirect revalidation, 5 redirects, 8 MiB per image, and 12 candidates. Keep operator-controlled OpenRouter URLs explicitly separate.

Run the full gate, inspect scope, update plan status, and make the one commit.

**Verify**:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run fallow:dead-code
git diff --check
git status --short
```

Expected: every command exits 0; only scoped files are changed before commit.

## Test plan

Use three layers:

- `public-http-url.test.ts`: deterministic URL/address/DNS policy with no network.
- `image-ocr.test.ts`: redirect-by-redirect enforcement, bounded streaming bytes, and unchanged OCR behavior.
- `external-tools.test.ts`: candidate ordering/deduplication/cap at the scrape boundary.

Tests must assert that denied destinations are rejected before a corresponding fetch, not merely that the final result is `ok: false`.

## Done criteria

- [ ] URL image downloads accept only HTTP(S) destinations resolving exclusively to public addresses.
- [ ] Every redirect is manual, revalidated, and limited to 5 hops.
- [ ] Image response bytes are capped at 8 MiB by header and stream count.
- [ ] Scrape OCR receives at most 12 prioritized unique images.
- [ ] OpenRouter/provider fetch behavior is unchanged.
- [ ] Per-image failures remain non-fatal to batches.
- [ ] No new dependency or real-network test was added.
- [ ] DOX states the live outbound image policy.
- [ ] Focused and full gates pass, including Fallow.
- [ ] Exactly one commit exists with message `fix(scrape): block private-network image fetches`.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Plan 003 is not `DONE` or the baseline is red.
- Correct TLS/SNI behavior requires pinning a DNS result through a custom dispatcher; do not add a dependency or weaken certificate checks without design review.
- The runtime cannot expose a response stream/cancel operation needed for byte enforcement.
- Existing supported scrape behavior intentionally requires local/private images.
- Tests require real DNS or network access.
- The fix starts changing operator-configured OpenRouter fetches or OCR result schemas.
- A verification command fails twice after a reasonable scoped correction.

## Maintenance notes

Review the IP deny table when Node networking behavior or deployment IPv6 support changes. Any future redirect-following outbound fetch of untrusted URLs must reuse this policy or an equivalent stronger client. The 12-image/8-MiB limits are product-cost and memory controls; revisit them deliberately if model input limits change.
