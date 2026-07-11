# Plan 003: Enforce safe local API defaults and browser origins

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only files listed in Scope. If a STOP condition occurs, stop and report; do not improvise. Make exactly one commit for this plan. When done, update only plan 003's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9b8d66b6..HEAD -- apps/server/src/config-env.ts apps/server/src/config-env.test.ts apps/server/src/index.ts apps/server/src/index.test.ts README.md apps/server/AGENTS.md`
>
> Plan 002 must already be `DONE` and is expected to have changed `index.ts`, `index.test.ts`, and `apps/server/AGENTS.md`. Compare only the origin/CORS excerpts below against live code, preserve plan 002's body-limit/error mapping, and STOP if the two changes cannot be composed cleanly. `plans/README.md` is excluded because the status ledger is expected to change.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-bound-inbound-json-media.md`
- **Category**: security
- **Planned at**: commit `9b8d66b6`, 2026-07-11

## Why this matters

The default server listens on every network interface and allows every browser origin. Routes include project deletion and paid model execution, but there is no authentication or request-origin gate. This plan makes the default product local-only, accepts one configured browser origin, and rejects browser requests carrying any other `Origin` before route side effects occur.

## Current state

Applicable contracts:

- The first-party Vite client defaults to `http://localhost:3001` (`apps/client/src/lib/landing-agent.ts:3-5`).
- `README.md` currently documents `CLIENT_ORIGIN=*` and `HOST=0.0.0.0` defaults.
- Server routing is a custom `node:http` server, not Hono/Express. Match the small helper/function style in `apps/server/src/index.ts`.
- Environment parsing is pure and tested through `createConfigFromEnv` in `apps/server/src/config-env.test.ts`.

Unsafe defaults:

```ts
// apps/server/src/config-env.ts:48,57
clientOrigin: optionalEnv(source, 'CLIENT_ORIGIN') ?? '*',
// ...
host: optionalEnv(source, 'HOST') ?? '0.0.0.0',
```

CORS headers are set before routing, but no request is rejected:

```ts
// apps/server/src/index.ts:67-74
const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    // ...
  }
})

// apps/server/src/index.ts:637-644
function setCorsHeaders(response: ServerResponse) {
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader(
    'access-control-allow-methods',
    'DELETE,GET,PATCH,POST,OPTIONS',
  )
  response.setHeader('access-control-allow-origin', config.clientOrigin)
}
```

Current tests deliberately lock in the old defaults:

```ts
// apps/server/src/config-env.test.ts:22-29
expect(config.host).toBe('0.0.0.0')
expect(config.clientOrigin).toBe('*')
```

`withServer` already sets `CLIENT_ORIGIN=https://client.test`, so it is the right place to test matching, mismatching, absent, and `null` Origin behavior.

## Target contract

- Default `HOST` is `127.0.0.1`.
- Default `CLIENT_ORIGIN` is `http://localhost:5173`.
- `CLIENT_ORIGIN` must be one normalized absolute `http:` or `https:` origin with no credentials, path beyond `/`, query, or fragment. Wildcard `*`, `null`, and comma-separated lists are rejected during config creation.
- Requests without an `Origin` header remain allowed for CLI/server-to-server use and existing Node tests.
- Requests with an `Origin` header must exactly equal configured `clientOrigin`; all other browser origins, including literal `null`, receive JSON `403` before OPTIONS handling or route side effects.
- An allowed browser request gets `Access-Control-Allow-Origin` set to the configured exact origin and `Vary: Origin`. Never reflect arbitrary request input.
- This is a safe default/local browser boundary, not remote-deployment authentication. Explicit non-loopback `HOST` still requires an operator-controlled network perimeter; document that limitation without claiming authentication.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Config tests | `pnpm --filter @workspace/server test -- src/config-env.test.ts` | exit 0; all config tests pass |
| Route tests | `pnpm --filter @workspace/server test -- src/index.test.ts` | exit 0; all route tests pass |
| Server checks | `pnpm --filter @workspace/server lint && pnpm --filter @workspace/server typecheck` | exit 0, no errors |
| Full gate | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run fallow:dead-code` | every command exits 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Scope

**Implementation files in scope**:

- `apps/server/src/config-env.ts`
- `apps/server/src/config-env.test.ts`
- `apps/server/src/index.ts`
- `apps/server/src/index.test.ts`
- `README.md`
- `apps/server/AGENTS.md`

**Administrative file in scope**:

- `plans/README.md` — update only plan 003's status cell.

**Out of scope**:

- Adding users, sessions, cookies, bearer tokens, or a remote deployment mode.
- Client source changes, proxy configuration, TLS, CSRF tokens, rate limits, or body limits.
- Generated preview iframe isolation.
- Allowing origin lists, wildcard subdomains, regexes, or request-origin reflection.

## Git workflow

- Work only after plan 002 is `DONE`.
- Produce exactly one commit: `fix(server): enforce local API origin boundary`.
- Include only files in Scope. Do not push or open a PR.

## Steps

### Step 1: Parse one safe configured client origin and change defaults

In `config-env.ts`:

1. Change the host default to `127.0.0.1`.
2. Change the client origin default to `http://localhost:5173`.
3. Add a focused parser for `CLIENT_ORIGIN` that uses `URL`, accepts only `http:`/`https:`, rejects credentials/path/query/fragment/wildcards/lists/`null`, and stores the canonical `.origin` string.
4. Keep custom `HOST`, `PORT`, and all other env behavior unchanged.

In `config-env.test.ts`, update the default assertion and add table-driven cases for:

- accepted canonical localhost and HTTPS origins;
- normalization of a trailing `/` only;
- rejected wildcard, literal `null`, unsupported scheme, credentials, non-root path, query, fragment, and multiple values.

Assert errors name `CLIENT_ORIGIN` but do not echo unrelated environment values.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/config-env.test.ts
pnpm --filter @workspace/server typecheck
```

Expected: all tests pass; default config is loopback plus the Vite origin.

### Step 2: Reject mismatched browser origins before routing

In `index.ts`:

1. Add a small exact-match helper that treats an absent `Origin` as allowed and every present non-equal value as disallowed.
2. Move CORS setup inside the request `try` as needed so config/origin errors use consistent JSON handling.
3. Before `routeRequest`, reject disallowed origins with `403` JSON. This check must precede OPTIONS handling and every route side effect.
4. Set CORS headers only for allowed requests. Use the configured exact origin and append/merge `Vary: Origin`; never use the untrusted request value as the allow-origin value.
5. Preserve the existing methods/headers allowlists and all successful route shapes.

In `index.test.ts`, use `withServer`'s configured `https://client.test` and add cases:

- matching-origin OPTIONS returns `204` and exact allow-origin plus `Vary: Origin`;
- matching-origin state-changing request reaches the route;
- absent-origin request remains accepted;
- mismatching origin receives `403` and the mocked agent/stop/delete side effect does not run;
- literal `Origin: null` receives `403`;
- mismatching preflight receives `403`, not `204`.

If testing delete side effects would require broad fixture changes, prove the pre-routing property with the existing mocked `streamLandingAgent` and stop callback instead.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/index.test.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
```

Expected: all commands exit 0; disallowed origins never reach route mocks.

### Step 3: Update durable documentation

Update:

- `README.md` environment table with the new exact defaults and a concise note that browser requests with another Origin are rejected. State that non-loopback exposure is unauthenticated and needs an operator-controlled network boundary.
- `apps/server/AGENTS.md` with the same operational contract: default loopback bind, exact configured browser origin, absent-Origin allowance, and pre-routing `403` rejection.

Do not add a security history or claim this is full authentication.

**Verify**:

```bash
git grep -n '0\.0\.0\.0\|CLIENT_ORIGIN.*\*' -- README.md apps/server/AGENTS.md apps/server/src/config-env.ts apps/server/src/config-env.test.ts
git diff --check -- README.md apps/server/AGENTS.md
```

Expected: the first command returns no stale default references (exit 1 is expected); diff check exits 0.

### Step 4: Run all gates and commit

Run all gates, inspect scope, update plan status, and create the single commit.

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

Expected: every command exits 0 and only files in Scope are changed before commit.

## Test plan

Follow `config-env.test.ts`'s pure parser tests and `index.test.ts`'s real HTTP server tests. Required coverage:

1. safe defaults;
2. accepted canonical origins;
3. invalid configuration rejection;
4. exact allowed-origin preflight;
5. absent-origin compatibility;
6. mismatch and `null` rejection;
7. pre-routing/no-side-effect behavior;
8. unchanged CORS method/header values.

Do not write tests that merely inspect a helper without sending an HTTP request for the route behavior.

## Done criteria

- [ ] Default host is `127.0.0.1` and default client origin is `http://localhost:5173`.
- [ ] Wildcard/list/opaque/credentialed/path-bearing origins cannot enter config.
- [ ] Present mismatching Origin headers receive `403` before OPTIONS or route logic.
- [ ] Matching requests receive exact allow-origin and `Vary: Origin`.
- [ ] Requests without Origin remain accepted.
- [ ] README and server DOX state the real boundary and remote-exposure limitation.
- [ ] Focused and full gates pass, including Fallow.
- [ ] Exactly one commit exists with message `fix(server): enforce local API origin boundary`.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Plan 002 is not `DONE` or the baseline gate is red before work.
- A supported first-party workflow uses a browser origin other than configurable `CLIENT_ORIGIN` and cannot set the documented env value.
- Existing production requirements explicitly require wildcard/multiple origins; this plan intentionally does not design a list policy.
- Origin enforcement requires adding client-held secrets or an auth system.
- Plan 002 changed the same request wrapper and a clean reconciliation would undo body-limit handling.
- A verification command fails twice after a reasonable scoped correction.

## Maintenance notes

CORS headers are not authentication; the security property here is safe loopback defaults plus rejection of mismatched browser origins before side effects. Any future non-loopback deployment needs a separate authenticated API design. New routes automatically inherit the gate only if they remain behind the single `createServer` request wrapper.
