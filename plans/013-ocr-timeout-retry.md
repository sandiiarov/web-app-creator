# Plan 013: Add a timeout + retry to screenshot OCR and surface failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a43ca336..HEAD -- apps/server/src/mastra/lib/image-ocr.ts apps/server/src/mastra/tools/screenshot.ts`
> If any in-scope file changed, compare excerpts against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a43ca336`, 2026-07-09

## Why this matters

An e2e QA campaign (`screenshots/e2e-5run/REPORT.md`) confirmed screenshot OCR **works** (29 vision calls across 5 projects, 0 silent failures). However the code audit found the OCR `fetch` in `image-ocr.ts` has **no timeout and no retry** — a slow or hung Z.AI vision response would hang the agent stream indefinitely (the `fetch` relies on default Node behavior), and a transient 5xx fails immediately with no recovery. This plan is **preventive hardening for a latent robustness gap**, not a fix for an observed failure: bound the OCR call with an `AbortController` timeout + retry transient 5xx/abort so the screenshot tool degrades gracefully instead of hanging.

## Current state

- `apps/server/src/mastra/lib/image-ocr.ts` — `ocrImageInputs` issues a single bare `fetch` (no `AbortController`, no retry loop):
  ```ts
  // image-ocr.ts (inside ocrImageInputs)
  const response = await fetch(
    `${trimTrailingSlash(config.openrouter.chatApiUrl)}/chat/completions`,
    { body: JSON.stringify({...}), headers: {...}, method: 'POST' },
  )
  ```
  On `!response.ok` it returns `{ ok: false, reason: 'OpenRouter vision error (...): ...', text: '' }`. There is no timeout — the fetch relies on the default Node/https behavior.

- `apps/server/src/mastra/tools/screenshot.ts:177` — calls `ocrImageInputs(...)` unconditionally after a successful capture; the screenshot capture itself already has a timeout (`SCREENSHOT_TIMEOUT_MS = 25_000`, screenshot.ts:8, 151) but the OCR step does not.

- `apps/server/src/mastra/route.ts:580` — `visionCalls += 1` only when `imageOcr?.ok && imagesAnalyzed > 0`, which is why project 1's 5 failed OCR calls produced `vision.calls=0` with `toolErrors=0`.

- Repo retry convention: `apps/server/src/mastra/lib/retry.ts` exists — read it for the established retry/backoff helper and reuse it rather than hand-rolling.

## Commands you will need

| Purpose   | Command                                                   | Expected on success |
|-----------|-----------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                            | exit 0              |
| Typecheck | `pnpm run typecheck`                                      | exit 0, no errors   |
| Lint      | `pnpm run lint`                                           | exit 0              |
| Format    | `pnpm run format:check`                                   | exit 0              |
| Tests     | `pnpm --filter @workspace/server test -- --run image-ocr` | all pass            |
| Full test | `pnpm run test`                                           | all pass, coverage ≥ 90% |

## Scope

**In scope**:
- `apps/server/src/mastra/lib/image-ocr.ts` — wrap the fetch in a timeout + retry; keep the `ImageOcrResult` shape unchanged
- `apps/server/src/mastra/lib/image-ocr.test.ts` — add timeout/retry behavior tests (the file already exists)

**Out of scope**:
- `screenshot.ts` (no change — it already propagates `imageOcr.ok`/`reason`)
- `route.ts` (the `visionCalls` accounting is correct as-is)
- Changing the OCR model or system prompt
- The Pi agent's own Z.AI vision reader (separate tool, not in this repo)

## Git workflow

- Branch: `fix/013-ocr-timeout-retry`
- Conventional commits: `fix(image-ocr): <summary>`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the retry helper

Read `apps/server/src/mastra/lib/retry.ts` end-to-end. If it exports a generic `retry(fn, {attempts, backoffMs})`-style helper, use it. If it is specific to another use case, add a small local retry loop in `image-ocr.ts` (2 additional attempts, ~1s backoff) following the same style.

**Verify**: you understand the helper's signature (note it for step 2).

### Step 2: Add a fetch timeout via AbortController

Wrap the `fetch` call in `ocrImageInputs` with an `AbortController` that aborts after a bounded timeout (e.g. `OCR_TIMEOUT_MS = 30_000`). On `AbortError`, treat it as a retryable failure. Keep the request body/headers identical.

```ts
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)
try {
  response = await fetch(url, { ...opts, signal: controller.signal })
} finally {
  clearTimeout(timer)
}
```

**Verify**: `pnpm run typecheck` → exit 0.

### Step 3: Add a retry loop around the fetch + non-ok handling

Retry on (a) `AbortError` (timeout) and (b) `!response.ok` with a 5xx status. Do NOT retry on 4xx (client error — won't recover). After the final attempt, return the existing `{ ok: false, reason }` shape with a reason that notes the timeout/retry exhaustion (e.g. `OpenRouter vision timed out after 3 attempts`).

**Verify**: `pnpm run typecheck` + `pnpm run lint` → exit 0.

### Step 4: Tests

In `apps/server/src/mastra/lib/image-ocr.test.ts`, add (use `vi.fn()` with explicit type params per repo oxlint rule, and mock `fetch` with `vi.stubGlobal` or `vi.spyOn`):
- A timeout case: mock `fetch` to hang past the timeout → assert `ok:false` + reason mentions timeout, and that it retried the configured number of times.
- A transient-5xx-then-success case: mock `fetch` to return 503 then 200 → assert `ok:true` + the text from the 200 response.
- A 4xx-no-retry case: mock `fetch` to return 400 → assert `ok:false` + only one attempt.

Model after the existing tests in that file for structure/mocking.

**Verify**: `pnpm --filter @workspace/server test -- --run image-ocr` → all pass.

## Done criteria

- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` all exit 0
- [ ] `pnpm run test` exits 0; new OCR timeout/retry tests pass
- [ ] `ImageOcrResult` shape is unchanged (no caller changes needed)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- `retry.ts` does not exist or has no reusable helper (add a local loop, documented — do not invent a new shared abstraction).
- The existing `image-ocr.test.ts` mocking pattern does not use `vi.fn()`/`vi.stubGlobal` (re-read the file; match whatever pattern is there).
- A test reveals the OCR call is intentionally fire-and-forget (it is not — it is awaited; if evidence says otherwise, STOP).

## Maintenance notes

- The 30s timeout + 3 attempts means a worst-case ~90s added to a turn when Z.AI is fully down. If that becomes a problem, consider making OCR best-effort (return early with a "vision unavailable, fall back to read" note the agent can act on) — out of scope here.
- If Z.AI vision stabilizes, the retry count can be lowered. Watch the `vision.calls` vs `screenshotRequests` ratio in the stats event as the health signal.
