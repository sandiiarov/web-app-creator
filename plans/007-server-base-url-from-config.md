# Plan 007: Derive `baseUrl` from config (Host-header hardening)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/route.ts apps/server/src/config-env.ts apps/server/src/config-env.test.ts apps/server/AGENTS.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / correctness (Host-header hardening)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/route.ts` builds the server's own base URL from
the client-controlled `Host` header:

```ts
const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
```

That `baseUrl` flows into `createLandingPageAgent` →
`createGenerateImageTool(baseUrl, ...)` → the tool returns
`` `${baseUrl}/images/${id}.${ext}` `` to the agent, and the agent embeds
that URL into the persisted project HTML via `edit`. It also flows into
`expandScreenshotUrl(..., baseUrl)` for screenshot URLs sent to the
client. A poisoned `Host: evil.example` request therefore produces image
URLs like `http://evil.example/images/img-1.jpg` that get written into
`html.json` and served back on subsequent reads — a Host-header injection
that persists into project content.

Practical risk in the **default loopback deployment** is LOW (the
first-party browser sends the correct Host; CORS blocks cross-origin
browsers; CLI/server clients bypass CORS but are operator-controlled).
The risk grows the moment the server is exposed on a non-loopback
interface — which `apps/server/AGENTS.md` explicitly permits as the
operator's call ("Binding HOST to a non-loopback address does not add
authentication; expose it only behind an operator-controlled network
boundary"). This plan closes the vector by deriving `baseUrl` from a
new config-controlled `SERVER_BASE_URL` (defaulting to
`http://${host}:${port}`), so a poisoned `Host` header can no longer
shape persisted content.

## Current state

- `apps/server/src/mastra/route.ts:287` (inside `activeStreamLandingAgent`):
  ```ts
  const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
  ```
  Used downstream in the same function:
  - Passed into `createLandingPageAgent(store, mastra, baseUrl, ...)`
    (route.ts:289-313), which forwards it to `createLandingTools` and on
    to `createGenerateImageTool(baseUrl, ...)`.
  - Passed into `analyzePromptAttachments({ ..., baseUrl, ... })`
    (route.ts:434).
  - Passed to `expandScreenshotUrl(viewport.imageUrl, baseUrl)`
    (route.ts:1029).

- `apps/server/src/config-env.ts` exports `createConfigFromEnv(source)`:
  the returned object has `host`, `port`, `clientOrigin`,
  `openrouter.*`, `cloudflare.*`, `firecrawl.*`, `agentRetry`,
  `agentGeneration`, `agentMaxCostUsd`, `mastra`. It does NOT have any
  `serverBaseUrl` / `baseUrl` field today.
- `apps/server/src/config-env.test.ts` unit-tests env parsing using
  `optionalEnv`/`parseClientOrigin` etc.; the file's structure is the
  pattern to follow for the new test.
- `apps/server/AGENTS.md` "Optional env" list mentions `HOST`, `PORT`,
  `CLIENT_ORIGIN` and the rest, but no `SERVER_BASE_URL`.
- `README.md` "Other" env table lists `HOST` / `PORT` / `CLIENT_ORIGIN`
  with defaults.

The Host header is also read in `apps/server/src/index.ts:228` —
`new URL(request.url ?? '/', \`http://${request.headers.host}\`).pathname`
— but ONLY for parsing the request pathname (the host half is discarded).
That use is safe; do not change it.

### Repo conventions to match

- `config-env.ts` parses each env field with a small dedicated helper
  (`optionalEnv`, `parseNonNegativeNumber`, `parsePort`,
  `parseClientOrigin`). Add a `parseServerBaseUrl(value, fallback)`
  helper in the same style — validate with `URL.canParse`, normalize
  (strip trailing slash), reject `*`/`null`/multi-value (mirror
  `parseClientOrigin`).
- The config object is `as const` — add the new field alphabetically
  inside the existing object literal (per perfectionist sort rules).
- `route.ts` imports `{ config }` from `'../config.ts'` and reads fields
  like `config.port`, `config.host`. Read `config.serverBaseUrl` the
  same way.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Focused    | `pnpm --filter @workspace/server test -- --run config-env 2>&1 \| tail -15` | new + existing config-env tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/config-env.ts` — add `parseServerBaseUrl` + the
  `serverBaseUrl` field on the returned config.
- `apps/server/src/config-env.test.ts` — add tests for default,
  override, trailing-slash normalization, and invalid-value rejection.
- `apps/server/src/mastra/route.ts` — replace the `baseUrl` line (line
  287) with `const baseUrl = config.serverBaseUrl`.
- `apps/server/AGENTS.md` — add `SERVER_BASE_URL` to the optional-env
  list with a one-line default/purpose.
- `README.md` — add `SERVER_BASE_URL` to the "Other" env table.

**Out of scope** (do NOT touch):
- `apps/server/src/index.ts:228` — its `request.headers.host` use is
  pathname-only and safe.
- Any caller of `createLandingPageAgent`, `analyzePromptAttachments`, or
  `expandScreenshotUrl` — the signature stays `baseUrl: string`; only
  the source of the string changes.
- The CORS logic in `index.ts` — `CLIENT_ORIGIN` is a separate concern
  (browser-app origin vs. server origin).
- The OpenRouter/Cloudflare/Firecrawl config — unrelated.

## Git workflow

- Branch: `advisor/007-server-base-url-from-config`.
- Commit message style (match repo): e.g.
  `fix(server): derive baseUrl from SERVER_BASE_URL config, not Host header`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `parseServerBaseUrl` + the config field

In `apps/server/src/config-env.ts`:

1. Add a `DEFAULT_SERVER_BASE_URL` derivation is **dynamic** (depends on
   parsed `host` + `port`), so do NOT use a module-level const — compute
   the default inline inside `createConfigFromEnv`. Pattern:

   ```ts
   const host = optionalEnv(source, 'HOST') ?? DEFAULT_HOST
   const port = parsePort(optionalEnv(source, 'PORT') ?? '3001')
   ```

   Then derive the default serverBaseUrl from those parsed values:

   ```ts
   const serverBaseUrl = parseServerBaseUrl(
     optionalEnv(source, 'SERVER_BASE_URL') ??
       `http://${host}:${port}`,
   )
   ```

   Add `serverBaseUrl` to the returned object literal (alphabetical order
   is enforced by `oxlint --fix`).

2. Add the helper, modeled on `parseClientOrigin`:

   ```ts
   const INVALID_SERVER_BASE_URL_VALUES = new Set(['*', 'null'])

   function parseServerBaseUrl(value: string) {
     if (
       INVALID_SERVER_BASE_URL_VALUES.has(value) ||
       value.includes(',')
     ) {
       throw new Error('Invalid SERVER_BASE_URL value')
     }
     if (!URL.canParse(value)) {
       throw new Error('Invalid SERVER_BASE_URL value')
     }
     const url = new URL(value)
     if (
       url.protocol !== 'http:' &&
       url.protocol !== 'https:'
     ) {
       throw new Error('Invalid SERVER_BASE_URL value')
     }
     // Reject anything beyond origin (no path/query/frag/userinfo).
     const hasUnsupportedParts = [
       url.username,
       url.password,
       url.pathname === '/' ? '' : url.pathname,
       url.search,
       url.hash,
     ].some(Boolean)
     if (hasUnsupportedParts) {
       throw new Error('Invalid SERVER_BASE_URL value')
     }
     return url.origin
   }
   ```

   `url.origin` already normalizes the trailing slash and gives
   `http://host:port` / `https://host` form — perfect for prefixing
   `/images/...` URLs.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Add config-env tests

In `apps/server/src/config-env.test.ts`, mirror the existing test
structure (read the file first — it constructs a `ConfigEnvironment`
object and asserts fields on the result). Add four cases:

1. **Default** — omit `SERVER_BASE_URL`, `HOST`, `PORT`; expect
   `config.serverBaseUrl === 'http://127.0.0.1:3001'`.
2. **Derived from HOST/PORT** — set `HOST=0.0.0.0`, `PORT=4000`; expect
   `config.serverBaseUrl === 'http://0.0.0.0:4000'`.
3. **Explicit override** — set `SERVER_BASE_URL=https://example.com`;
   expect `config.serverBaseUrl === 'https://example.com'`.
4. **Trailing-slash normalization** — set
   `SERVER_BASE_URL=https://example.com/`; expect
   `config.serverBaseUrl === 'https://example.com'` (no trailing slash).
5. **Invalid values throw** — set `SERVER_BASE_URL=*` (or `null`, or
   `ftp://x`, or `https://x/path`); expect `createConfigFromEnv` to
   throw `Invalid SERVER_BASE_URL value`.

Match the file's existing assertion style (`expect(...).toBe(...)` or
`.toThrow(...)`).

**Verify**: `pnpm --filter @workspace/server test -- --run config-env 2>&1 | tail -15`
→ all new tests pass.

### Step 3: Use `config.serverBaseUrl` in `route.ts`

In `apps/server/src/mastra/route.ts` line 287, replace:

```ts
const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
```

with:

```ts
const baseUrl = config.serverBaseUrl
```

The downstream uses (`createLandingPageAgent`, `analyzePromptAttachments`,
`expandScreenshotUrl`) all accept a `baseUrl: string` — they keep working
unchanged. The `request` parameter stays in the `activeStreamLandingAgent`
destructure (it's still used elsewhere in the function).

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 4: Update `apps/server/AGENTS.md`

Add `SERVER_BASE_URL` to the env-vars sentence in `apps/server/AGENTS.md`
"Local Contracts" → the bullet listing `CLIENT_ORIGIN`, `HOST`, `PORT`,
etc. Insert it adjacent to `HOST` / `PORT` (alphabetical-ish ordering
within the existing list — match the surrounding style). One-line
purpose: "server's own origin used to build absolute image/screenshot
URLs the agent embeds in HTML; defaults to `http://${HOST}:${PORT}`."

Also add `SERVER_BASE_URL` to `README.md` "Other" env table:

| Var | Default | Purpose |
|-----|---------|---------|
| `SERVER_BASE_URL` | `http://${HOST}:${PORT}` | Server origin used to build absolute image/screenshot URLs the agent embeds in HTML; override when behind a proxy. |

**Verify**: `grep -n 'SERVER_BASE_URL' apps/server/AGENTS.md README.md`
→ matches in both files.

### Step 5: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0. (Run `lint:fix` if
  perfectionist sort wants the new config field in a specific spot.)
- `pnpm --filter @workspace/server test` → exit 0; baseline + 5 new
  tests; coverage ≥ 90%.
- `pnpm run fallow:dead-code` → exit 0 (or only the pre-existing
  `@workspace/agent-skills` flag — record in NOTES, do not chase).

### Step 6: Confirm scope

**Verify**: `git status --short` lists ONLY:
- `M apps/server/src/config-env.ts`
- `M apps/server/src/config-env.test.ts`
- `M apps/server/src/mastra/route.ts`
- `M apps/server/AGENTS.md`
- `M README.md`

Reject any other modified file.

## Test plan

Five new unit tests in `config-env.test.ts` (described in Step 2). They
pin:

- The default derives correctly from `HOST` + `PORT`.
- Explicit `SERVER_BASE_URL` overrides the default.
- Trailing slash is normalized (so URLs like
  `https://example.com//images/x.jpg` are impossible).
- Invalid values (`*`, `null`, non-http(s) protocols, URLs with paths)
  throw at config-build time, so a misconfigured deploy fails fast
  instead of producing malformed URLs at runtime.

No new tests needed in `route.test.ts` — the `baseUrl` value flows
unchanged through downstream code; the existing integration tests prove
the wiring. (The behavior change is "no longer honors Host header,"
which is what we want — there's no positive test for "ignored
correctly" beyond the unit-level config test.)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline + 5; coverage ≥ 90%
- [ ] `grep -nE 'request\.headers\.host.*localhost.:config\.port' apps/server/src/mastra/route.ts`
      returns no matches (the Host-derived line is gone)
- [ ] `grep -n 'serverBaseUrl' apps/server/src/config-env.ts` returns
      matches for both the type field and the parse helper
- [ ] `git status --short` lists ONLY the five in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the live `route.ts:287` line does not
  match the excerpt (someone already reworked `baseUrl`).
- Any other site in `route.ts` or `tools/*.ts` reads
  `request.headers.host` for content that gets persisted (re-run
  `grep -rn 'headers.host' apps/server/src --include='*.ts'` and
  reconcile). If a new persistence path appeared, the plan needs to
  cover it too — STOP and report.
- `URL.canParse` is not available in the target Node version. (Node 22
  has it; the engines field requires `>=22.19`.) If somehow the
  resolved runtime is older, fall back to `try { new URL(value) } catch
  { throw ... }` — but report it first.
- `parseClientOrigin`'s shape has drifted and `parseServerBaseUrl`
  cannot mirror it cleanly. Report the diff and pick the closest
  valid-by-construction alternative.

## Maintenance notes

- After this lands, the server ignores the `Host` header for content
  generation. Operators behind a reverse proxy MUST set
  `SERVER_BASE_URL` to the publicly-routed origin, or generated image
  URLs will reference the bind address (e.g. `http://127.0.0.1:3001`)
  and fail to load from the browser. The `README.md` + `AGENTS.md`
  updates document this.
- This plan pairs with plan 008 (sanitize 500 responses) as the two
  "harden for non-loopback exposure" changes. They touch different files
  and can run in either order.
- The threat model: AGENTS already says non-loopback binding is the
  operator's call and requires a trusted network. This plan removes ONE
  of the foot-guns (Host header injection) but does NOT add
  authentication. A subsequent hardening pass could enforce Host
  allowlisting at the HTTP layer (reject requests whose Host is not in
  an allowlist) — out of scope here.
- Reviewer: the diff should add a config field + helper + tests, change
  ONE line in `route.ts`, and update two docs. Reject any change to
  caller signatures, to the OpenRouter/CORS logic, or to other
  env vars.
