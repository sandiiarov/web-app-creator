# Server Application DOX

## Purpose

- Own durable run admission, lifecycle completion, recovery, and cooperative project deletion.

## Ownership

- `run-coordinator.ts`: per-project run gate, request identity, committed acceptance and terminal records, provider-work draining, stop, and restart projection repair.
- `project-service.ts`: keyed creation gate and tombstone-driven memory/file deletion.

## Local Contracts

- The sequenced client journal is lifecycle authority. `run-state.json` and legacy SSE terminal events are projections written only after the canonical lifecycle record commits.
- A run is acknowledged and provider work may start only after its sanitized acceptance record and attachment assets commit. The turn ID is an idempotency key; identical retries join or reuse the accepted run, while changed canonical request content conflicts.
- One `run_terminal` record owns each accepted turn's outcome and final known stats. Failed operation draining records `run_blocked`, retains the admission gate, revokes ordinary writes, and may terminalize only after actual local work and metadata settle.
- Recovery never resumes paid work. It repairs terminal projections or appends one interrupted terminal for an open accepted or legacy turn. An incomplete journal tail blocks admission until explicit journal recovery.
- Deletion commits a tombstone outside the project directory before stopping work. During draining only owner lifecycle/accounting writes remain allowed; completion revokes every project write before verified memory and file removal. Completed tombstones prevent creation-key reuse and make repeated deletion idempotent.

## Work Guidance

- Keep transport validation and SSE encoding in the HTTP layer, model/tool execution in Mastra, durable bytes in storage, and fan-out in the run bus.
- Do not claim transactions across the journal, projections, Mastra memory, and project files. Each stage must be replayable after interruption.

## Verification

- `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm --filter @workspace/server exec vitest run src/application/run-coordinator.test.ts src/application/project-service.test.ts --coverage=false`
- `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm --filter @workspace/conversation test`

## Child DOX Index

- None.
