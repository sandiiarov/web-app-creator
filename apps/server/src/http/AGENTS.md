# HTTP delivery boundary

## Purpose

Owns validated HTTP/SSE protocol delivery outside lifecycle and storage authority.

## Local Contracts

- Protocol v2 subscribes before reading its consistent repository snapshot and keeps that subscriber through the connection.
- Project events use committed journal sequence numbers. Reconnect sends a fresh authoritative snapshot, then records newer than its cursor.
- Queues contain lightweight committed records, close on bounded overflow, and never block project generation.
- List streams publish complete authoritative snapshots and coalesce committed invalidations for at most 50 ms.
- Legacy HTTP/SSE handlers remain available while first-party clients migrate.

## Verification

- `pnpm exec vitest run src/http/project-events.test.ts --coverage=false`
