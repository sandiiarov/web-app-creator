# Server Testing DOX

## Purpose

- Own isolated server runtime fixtures and process-wide network denial for tests.

## Ownership

- `runtime-fixture.ts`: temporary root plus fully injected fake provider runtime.
- `deny-network.ts`: blocks fetch, Node HTTP/HTTPS, and TCP before test modules load; only exact loopback fixture origins registered after listen are allowed.
- `startup.test.ts`: fresh-process real-main startup regression with production composition copied into a temporary app root and guarded against provider network or out-of-root filesystem mutation.
- `test-safety.test.ts`: import and destination safety guards.
- `protocol-browser-fixture.ts`: deterministic temporary API project for two-editor browser QA; `/release`, `/reset`, and `/shutdown` are fixture-only controls on a separate loopback listener.

## Local Contracts

- Every fixture owns an OS-temporary root and removes it only after awaited runtime disposal.
- Ordinary tests must not call paid or external providers.
- Tests that need HTTP may use only their own loopback listener and must unregister its exact origin during teardown. The explicitly opted-in Firecrawl screenshot smoke may acquire an external-network lease only when `RUN_FIRECRAWL_SMOKE=1`; setting the variable alone does not bypass the guard. Ordinary verification always sets it to `0`.

## Work Guidance

- Inject typed fakes that fail on unexpected provider calls.
- Await runtime completion and disposal instead of polling run registries.
- Launch browser QA with `pnpm --filter @workspace/server fixture:protocol`, point the client at the printed `apiUrl` through `VITE_SERVER_URL`, and always call the printed control server's `POST /shutdown` when finished.

## Verification

- `RUN_FIRECRAWL_SMOKE=0 pnpm --filter @workspace/server exec vitest run src/testing/test-safety.test.ts src/runtime.test.ts --coverage=false`

## Child DOX Index

- None.
