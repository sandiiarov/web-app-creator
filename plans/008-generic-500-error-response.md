# Plan 008: Stop leaking `error.message` in 500 responses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/index.ts apps/server/src/index.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (info-disclosure hardening)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/index.ts` returns the raw `error.message` from any
unhandled handler exception to the client as JSON:

```ts
sendJson(response, 500, { error: errorMessage(error), ok: false })
```

In the default loopback deployment the impact is small (single-tenant,
operator-owned). The risk grows the moment the server is exposed on a
non-loopback interface — which `apps/server/AGENTS.md` explicitly
permits as the operator's call. A 500 triggered by, say, a filesystem
error then leaks absolute paths, provider error bodies, or internal
stack details to any client that can reach the port. This plan logs the
full error server-side (where the operator can debug it) and returns a
generic message to the client.

This pairs with plan 007 (Host-header hardening) as the two
"harden-for-non-loopback-exposure" changes. They touch disjoint files
and run in either order.

## Current state

`apps/server/src/index.ts` top-level request handler (around lines 41-60
at commit `5daf56ef`):

```ts
const server = createServer(async (request, response) => {
  try {
    if (!isRequestOriginAllowed(request)) {
      sendJson(response, 403, { error: 'Origin is not allowed.', ok: false })
      return
    }

    setCorsHeaders(response)
    await routeRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      if (error instanceof RequestBodyTooLargeError) {
        sendJson(response, 413, {
          error: 'Request body exceeds the allowed size.',
          ok: false,
        })
      } else {
        sendJson(response, 500, { error: errorMessage(error), ok: false })
      }
    } else {
      response.end()
    }
  }
})
```

The `errorMessage` helper at the bottom of the file:

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
```

A grep for `errorMessage` across `apps/server/src` at recon returned only
this one call site and the definition — so once the 500 path stops using
it, the helper is dead and should be deleted.

The 413 path stays unchanged — `'Request body exceeds the allowed
size.'` is a fixed, safe string. The 403 path is already a fixed string.
The new 500 path matches that pattern.

### Repo conventions to match

- `apps/server/src/index.ts` already uses `console.log` for the listen
  banner (`console.log(\`Server listening at http://${config.host}:${config.port}\`)`).
  A `console.error` for the unhandled-error log is consistent and
  lint-clean (the project's Oxlint `baseRules` in
  `packages/oxlint-config/src/index.ts` does NOT include `no-console`).
- Tests in `apps/server/src/index.test.ts` use Vitest with a `withServer`
  helper that boots the server on a random port and returns a `baseUrl`.
  Mock with `vi.spyOn`/`vi.fn` against `project-store.ts` exports (the
  file already does dynamic `import()` + `vi.doMock` patterns).

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Focused    | `pnpm --filter @workspace/server test -- --run index 2>&1 \| tail -15` | index tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/index.ts` — change the 500 branch to log internally
  + return a generic message; delete the now-dead `errorMessage` helper
  if grep confirms no other callers.
- `apps/server/src/index.test.ts` — add one regression test that asserts
  the generic 500 body and that the original error reaches `console.error`.

**Out of scope** (do NOT touch):
- The 413 (`RequestBodyTooLargeError`) and 403 branches — their messages
  are already fixed and safe.
- `setCorsHeaders`, `routeRequest`, `sendJson`, the CORS / origin
  checks — unchanged.
- The route handlers in `route.ts` — they own their own error
  shapes (e.g. `{ error: 'Project not found', ok: false }`); those are
  intentional and reachable, not leaked internals.
- DOX files — no behavioral contract changes that need documenting
  (operators reading `apps/server/AGENTS.md` don't see the JSON 500
  shape; the only contract is "non-2xx means error" and that stays).

## Git workflow

- Branch: `advisor/008-generic-500-error`.
- Commit message style (match repo): e.g.
  `fix(server): return generic 500 message, log real error server-side`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the 500 branch and log the real error

In `apps/server/src/index.ts`, replace the `else` branch inside the
`catch`:

```ts
} else {
  sendJson(response, 500, { error: errorMessage(error), ok: false })
}
```

with:

```ts
} else {
  // Log the full error server-side for operator debuggability; return a
  // generic message to the client so internal details (fs paths, provider
  // error bodies, stack strings) don't leak when the server is exposed
  // on a non-loopback interface.
  console.error('[server] unhandled error:', error)
  sendJson(response, 500, { error: 'Internal server error.', ok: false })
}
```

### Step 2: Delete the dead `errorMessage` helper (if confirmed unused)

Re-verify no other caller exists:

**Verify**: `grep -nE '\berrorMessage\(' apps/server/src --include="*.ts" -r`
→ only matches the definition itself (one match, in `index.ts`).

If confirmed, delete the helper and its leading JSDoc (if any):

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
```

If the grep returns ANY other caller, leave the helper in place and note
it in the reviewer NOTES.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Add a regression test in `index.test.ts`

Open `apps/server/src/index.test.ts`. Find the `withServer` helper and
the existing pattern for mocking route-side modules (the file already
uses `vi.doMock` for `route.ts` exports in some tests — read it first
and mirror that pattern).

The new test must:

1. Mock a project-store export that the `/api/projects` GET handler
   calls — `listProjects` is the simplest. Make it throw a synthetic
   error with a recognizable message, e.g.:
   ```ts
   const boom = new Error('SENSITIVE internal filesystem detail')
   vi.doMock('./mastra/lib/project-store.ts', () => ({
     listProjects: vi.fn(() => { throw boom }),
     // ...re-export anything else the handler chain needs, OR pick a
     // route that ONLY touches listProjects. See the existing tests
     // for the doMock shape used elsewhere.
   }))
   ```
2. Spy on `console.error`:
   ```ts
   const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
   ```
3. Inside `withServer`, GET `/api/projects` (or whichever route triggers
   the mocked throw).
4. Assert:
   - `response.status === 500`
   - `await response.json()` resolves to `{ error: 'Internal server
     error.', ok: false }` — and **NOT** the sensitive string
     (`'SENSITIVE internal filesystem detail'`).
   - `errorSpy` was called (at least once) with the original `boom`
     error (use `expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[server] unhandled error:'), boom)`
     — match the actual log shape from Step 1).
5. Restore `console.error` in `afterEach` (the file already has a
   top-level `afterEach` with `vi.restoreAllMocks()` — confirm it covers
   this).

The test pins three things at once: the body is generic, the original
error does NOT reach the body, and the original error DOES reach
`console.error`.

**Verify**: `pnpm --filter @workspace/server test -- --run index 2>&1 | tail -15`
→ the new test passes, all existing index tests still pass.

### Step 4: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0; baseline + 1 new test;
  coverage ≥ 90%.
- `pnpm run fallow:dead-code` → exit 0 (or only the pre-existing
  `@workspace/agent-skills` flag — record in NOTES, do not chase).

### Step 5: Confirm scope

**Verify**: `git status --short` lists ONLY
`apps/server/src/index.ts` and `apps/server/src/index.test.ts`.

## Test plan

One new integration test (described in Step 3). It pins:

- The 500 body is the fixed generic string, regardless of what the
  handler threw.
- The original error message does NOT appear in the response body.
- The original error is logged via `console.error` so operators can
  debug.

Pattern to follow: the existing `index.test.ts` cases that use `vi.doMock`
against `'./mastra/route.ts'` or `'./mastra/lib/project-store.ts'`. Read
the file first to mirror its setup (`withServer`, dynamic `import()`
after `vi.doMock`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline + 1; coverage ≥ 90%
- [ ] `grep -nE 'error: errorMessage\(error\)' apps/server/src/index.ts`
      returns no matches (the leak is closed)
- [ ] `grep -nE 'error: .Internal server error..' apps/server/src/index.ts`
      returns one match (the new generic body)
- [ ] `git status --short` lists ONLY the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the live `index.ts` catch block does
  not match the excerpt (someone reworked the error path since
  planning).
- `errorMessage` has another caller in `apps/server/src` besides the
  500 branch — leave the helper in place and note the caller in NOTES;
  do not delete blindly.
- The existing `index.test.ts` `withServer` helper does not support the
  `vi.doMock` flow needed to inject a throwing `listProjects` (the file
  has drifted from recon). Report the actual helper shape and pick the
  closest viable route to trigger a 500 (e.g. `vi.spyOn` on an already-
  imported module if dynamic-import mocking is not available).
- A passing test cannot reliably distinguish "original error logged"
  from "original error swallowed" — i.e. `console.error` is called from
  other code paths in the same request. If so, scope the spy assertion
  to a specific call index or use `toMatchInlineSnapshot` on the spy's
  calls array; report which.

## Maintenance notes

- After this lands, every unhandled handler exception produces
  `{ error: 'Internal server error.', ok: false }` on the wire and a
  full `[server] unhandled error:` line on stderr. Operators debugging
  a 500 read the server logs, not the response body.
- The 413 (`RequestBodyTooLargeError`) path is intentionally specific
  (clients use it to surface "too big" UX); leave it alone.
- A future hardening pass could route the `console.error` through the
  Mastra `PinoLogger` instead — but `index.ts` deliberately avoids
  pulling in Mastra types at the HTTP layer, and `console.error` is
  captured by standard process supervision (systemd, pm2, Docker logs)
  anyway. Don't bundle that wiring here.
- Reviewer: the diff should change one `else` branch, delete one helper
  (if confirmed dead), and add one test. Reject any change to the 413
  path, the CORS logic, or other handlers.
