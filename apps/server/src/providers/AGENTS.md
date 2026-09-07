# Provider Execution DOX

## Purpose

- Own bounded non-streaming provider transport and run-scoped operation lifetime.

## Ownership

- `transport.ts`: injected Fetch transport that owns headers and incremental body consumption for typed JSON, text, and bytes with named size limits.
- `operation-scope.ts`: run-owned cancellation, deadlines, child operations, write leases, deduplicated provider usage, and bounded drain results.

## Local Contracts

- Register provider work before dispatch and release it only after every local body/read/cancellation task settles.
- Safe reads may retry transient failures with abortable backoff. Paid POST requests do not retry without an endpoint-specific idempotency guarantee; failures after dispatch have an unknown remote outcome.
- The operation deadline covers attempts, backoff, and body consumption. Enforce body limits incrementally even when `Content-Length` is absent.
- A closing scope rejects new roots. Existing parents may create children only while the parent and scope remain active.
- Usage identity is operation id plus report id. Record provider-reported cost or credits immediately after parsing, before extraction, download, or persistence.
- A failed drain revokes write leases, aborts remaining local work, reports pending operation ids, and keeps the owning project fenced. Cancellation cannot guarantee remote cancellation or refunds.

## Work Guidance

- Use injected transports and controlled streams in tests; never call paid providers.
- Keep the main Mastra LLM stream on its installed adapter and run signal instead of buffering it through this transport.

## Verification

- `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm --filter @workspace/server exec vitest run src/providers/transport.test.ts src/providers/operation-scope.test.ts --coverage=false`
- `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm --filter @workspace/server typecheck`

## Child DOX Index

- None.
