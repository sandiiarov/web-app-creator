# Server Storage DOX

## Purpose

- Own low-level durable file replacement and authoritative event-journal primitives.

## Ownership

- `atomic-file.ts`: same-directory temporary writes, file flush, atomic rename, and directory durability outcomes for sync and async callers.
- `event-journal.ts`: validated sequenced JSONL reads, serialized durable appends, sticky failures, and explicit incomplete-tail recovery.

## Local Contracts

- Rename is the atomic visibility boundary. Failures before rename are not committed; failures after rename are durability-uncertain and callers must reconcile from the canonical file.
- Event records publish only after their complete newline and file data are flushed.
- A journal's first committed record also flushes the parent directory entry. Each project queue assigns monotonic `seq` values; legacy records without `seq` retain stable file-order positions.
- Plain reads never rewrite, truncate, or quarantine journals. Only explicit recovery may preserve and remove an incomplete trailing record.
- A failed append poisons that project's queue. Later appends and `flush()` reject without touching the file until `recoverTail()` succeeds. Recovery is serialized on the same queue, writes the raw trailing bytes to a quarantine file before truncation, and flushes the retained prefix.
- Invalid complete or interior records are corruption errors with file and line context.

## Work Guidance

- Keep filesystem operations injectable for deterministic failure tests.
- Never describe replacements across several files as one transaction.
- These primitives coordinate one process. They do not provide multi-writer locking.

## Verification

- `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm --filter @workspace/server exec vitest run src/storage/atomic-file.test.ts src/storage/event-journal.test.ts --coverage=false`

## Child DOX Index

- None.
