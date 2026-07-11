# Plan 002: Bound and validate inbound JSON media payloads

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only files listed in Scope. If a STOP condition occurs, stop and report; do not improvise. Make exactly one commit for this plan. When done, update only plan 002's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9b8d66b6..HEAD -- apps/server/src/http-body.ts apps/server/src/index.ts apps/server/src/index.test.ts apps/server/AGENTS.md`
>
> Plan 001 is expected to change other files only. If an implementation file above changed, compare Current state with live code and STOP on a mismatch. `plans/README.md` is excluded because its status ledger is expected to change.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-restore-dead-code-gate.md`
- **Category**: security / bug
- **Planned at**: commit `9b8d66b6`, 2026-07-11

## Why this matters

Every JSON endpoint currently buffers the entire request before validation. The attachment validator then trusts a caller-provided `size`, while screenshot responses have no decoded-byte cap. A bounded parser must reject oversized input while it is streaming, return an explicit `413`, and independently calculate base64 decoded size before model calls or disk writes.

## Current state

Applicable contracts:

- `apps/server/AGENTS.md` requires explicit route validation and limits attachments to supported raster formats. Base64 bytes must never enter durable JSON logs.
- Server tests are HTTP integration tests in `apps/server/src/index.test.ts`; use `withServer`, `postJson`, and the existing attachment/screenshot cases as the pattern.
- Keep environment files package-local and do not add dependencies for this change.

The body helper has no limit:

```ts
// apps/server/src/http-body.ts:3-11
export async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}
```

Both parsing paths call it without route context:

```ts
// apps/server/src/index.ts:225-228
async function readJson(request: IncomingMessage): Promise<AgentRequestBody> {
  const body = await readRequestBody(request)
  return body.trim().length > 0 ? (JSON.parse(body) as AgentRequestBody) : {}
}

// apps/server/src/index.ts:436-447
async function readJsonObject(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const body = await readRequestBody(request)
  // parse object...
}
```

Attachment validation checks the declared number, not decoded bytes:

```ts
// apps/server/src/index.ts:716-749
const size = typeof value.size === 'number' ? value.size : undefined
// ... validates size is 1..8 MiB ...
if (!isValidImageDataUrl(dataUrl, mediaType)) {
  return 'expected matching base64 dataUrl'
}
return { dataUrl, id, mediaType, name, size }
```

Screenshot validation checks media type and dimensions but no byte size (`apps/server/src/index.ts:752-787`). The top-level server catch maps every thrown body error to `500` (`apps/server/src/index.ts:67-78`).

## Target contract

Use named constants instead of unexplained literals:

- Small project create/PATCH JSON: maximum 64 KiB.
- `/agent` and screenshot POST-back JSON: maximum 24 MiB encoded body. This accommodates the existing 16 MiB total decoded attachment cap plus base64/JSON overhead.
- Individual screenshot decoded bytes: maximum 16 MiB.
- Existing image attachment cap: 8 MiB each and 16 MiB total, but calculated from decoded data, not trusted metadata.
- The declared attachment `size` must exactly equal calculated decoded bytes. Existing first-party clients already derive `size` from the image data.
- Exceeding an encoded body limit returns JSON status `413` and `{ ok: false, error: <stable non-sensitive message> }` without invoking the agent or writing a screenshot.
- Ordinary malformed JSON behavior is out of scope; do not silently change its current status in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `pnpm --filter @workspace/server test -- src/index.test.ts` | exit 0; all index route tests pass |
| Server typecheck | `pnpm --filter @workspace/server typecheck` | exit 0, no errors |
| Server lint | `pnpm --filter @workspace/server lint` | exit 0, no errors |
| Full gate | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run fallow:dead-code` | every command exits 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Scope

**Implementation files in scope**:

- `apps/server/src/http-body.ts`
- `apps/server/src/index.ts`
- `apps/server/src/index.test.ts`
- `apps/server/AGENTS.md`

**Administrative file in scope**:

- `plans/README.md` — update only plan 002's status cell.

**Out of scope**:

- Authentication, CORS/origin behavior (plan 003), outbound URL/image limits (plan 004), or client UI changes.
- Image magic-byte validation, recompression, antivirus scanning, or new dependencies.
- Changing existing attachment count, media type, dimensions, or total decoded limits except to enforce them against actual bytes.
- Changing malformed JSON from `500` to `400`.

## Git workflow

- Work only after plan 001 is `DONE`.
- Produce exactly one commit: `fix(server): bound JSON request payloads`.
- Include only files in Scope. Do not push or open a PR.

## Steps

### Step 1: Add a bounded streaming body reader

In `http-body.ts`:

1. Export a typed `RequestBodyTooLargeError` (or an equivalently explicit error class) that carries the byte limit but never echoes request data.
2. Change `readRequestBody` to require a positive integer `maxBytes` argument.
3. If a valid `content-length` header already exceeds the limit, fail before allocating body chunks.
4. While iterating chunks, maintain a running byte count and fail as soon as it exceeds the limit. Do not concatenate first and measure later.
5. Preserve the current UTF-8 return type for accepted requests.
6. Ensure the server can still send a `413`; do not destroy the socket before the response is written. Cleanly stop/drain the request according to Node's `IncomingMessage` behavior.

Add focused HTTP tests through `index.test.ts`, not a mock-only test of the helper:

- a small accepted JSON request still reaches its route;
- a declared `content-length` over the route limit receives `413`;
- a chunked/no-content-length body that crosses the limit receives `413`;
- the mocked `streamLandingAgent` is not called for rejected `/agent` bodies.

Do not include sensitive or executable misuse content in test names/messages; a repeated inert string is sufficient test data.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/index.test.ts
pnpm --filter @workspace/server typecheck
```

Expected: all tests pass and typecheck exits 0.

### Step 2: Apply route-specific limits and map overflow to 413

In `index.ts`:

1. Add named byte-limit constants near existing attachment limits.
2. Pass the 24 MiB limit from `handleAgent` to its JSON reader.
3. Pass 24 MiB from `handleScreenshotResponse` and 64 KiB from project create/PATCH handlers to `readJsonObject`.
4. In the top-level request catch, detect only `RequestBodyTooLargeError` and return `413` with stable JSON. Preserve the existing catch behavior for other exceptions.
5. Keep OPTIONS and bodyless GET/DELETE/stop routes behavior unchanged.

Test each body-bearing route class at its boundary. It is sufficient to cover one small-route rejection plus both media-bearing paths; do not allocate multiple maximum-sized payloads unnecessarily.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/index.test.ts
```

Expected: all tests pass; oversized requests are `413`, not `500`, and no agent/screenshot side effect occurs.

### Step 3: Validate actual decoded media size

In `index.ts`, add a small pure helper that, after the existing base64 syntax check, computes decoded byte length without trusting caller metadata. Normalize allowed whitespace consistently with the existing regex. Use this helper in both validators:

- Image/element attachment: reject when actual decoded bytes exceed 8 MiB, when aggregate actual decoded bytes plus element HTML exceed 16 MiB, or when declared `size` does not equal actual bytes. Store the calculated size in the returned attachment.
- Screenshot response: reject when decoded bytes exceed 16 MiB before `writeProjectScreenshotSync` is called.

Keep error messages concise and stable. Add regression tests to `index.test.ts` for:

- declared attachment size does not match actual base64 bytes;
- actual attachment bytes exceed the per-item cap even if metadata claims a smaller size;
- screenshot decoded bytes exceed its cap;
- valid existing attachment and screenshot fixtures still pass.

Avoid constructing huge permanent fixtures; generate inert base64 test data inside the test case.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/index.test.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
```

Expected: all commands exit 0 with no new warnings/errors.

### Step 4: Record the durable server contract and run all gates

Update `apps/server/AGENTS.md` with the encoded body limits, decoded media limits, exact attachment-size check, and `413` behavior. Keep the wording operational and current; do not add an audit diary.

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

Expected: all commands exit 0; only scoped files are changed before commit.

## Test plan

Use `apps/server/src/index.test.ts`'s existing `server HTTP routes` suite and `withServer` helper. Cover:

1. accepted under-limit request;
2. early content-length rejection;
3. streaming/chunked overflow rejection;
4. per-route limit selection;
5. `413` JSON shape;
6. no agent invocation or screenshot persistence after rejection;
7. declared/actual attachment mismatch;
8. actual per-file and aggregate attachment limits;
9. screenshot decoded limit;
10. unchanged acceptance of current valid fixtures.

Do not test only helper return values; the regression is at the HTTP boundary.

## Done criteria

- [ ] No call to `readRequestBody` omits an explicit maximum.
- [ ] Encoded body overflow is detected during streaming and returns `413` JSON.
- [ ] `/agent` and screenshot bodies use 24 MiB; create/PATCH use 64 KiB.
- [ ] Attachment limits use calculated decoded bytes and exact `size` equality.
- [ ] Screenshot decoded bytes are capped at 16 MiB before disk write.
- [ ] Existing valid media requests still pass.
- [ ] `apps/server/AGENTS.md` documents the live limits.
- [ ] Focused and full gates pass, including Fallow.
- [ ] Exactly one commit exists with message `fix(server): bound JSON request payloads`.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Plan 001 is not `DONE` or Fallow is not clean before implementation.
- Current first-party payloads legitimately exceed the target encoded/decoded limits; report measured sizes rather than silently raising limits.
- Sending `413` requires destroying the socket before a response can be delivered.
- Node's stream behavior makes the proposed helper leak or continue buffering after rejection and a scoped fix is not clear.
- Correct enforcement requires changing client wire types or files outside Scope.
- A verification command fails twice after a reasonable scoped correction.

## Maintenance notes

Any new body-bearing route must choose an explicit maximum; do not add a permissive default to `readRequestBody`. Keep encoded transport limits and decoded media limits distinct. If supported media formats or dimensions change, review both the base64 byte caps and the 24 MiB JSON envelope together.
