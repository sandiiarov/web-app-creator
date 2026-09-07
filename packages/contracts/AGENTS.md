# Shared Contracts DOX

## Purpose

- Own executable, framework-free schemas for HTTP commands, project snapshots, and protocol-v2 project/list events.

## Ownership

- `src/commands.ts`: run command and acknowledgment schemas.
- `src/project-events.ts`: versioned event envelopes and protocol errors.
- `src/project-snapshot.ts`: validated project metadata, conversation turns, and authoritative editor snapshots.
- `src/project-list.ts`: authoritative project-list snapshots.
- `src/protocol-limits.ts`: shared UTF-8 frame and queue limits.

## Local Contracts

- Wire types derive from Zod schemas. Apps parse untrusted network values before using them.
- Conversation turn behavior remains in `@workspace/conversation`; this package may validate its types but does not reduce events.
- Keep this package free of React and Node-only runtime imports.
- Protocol v2 uses fresh authoritative snapshots on reconnect. Cursors detect duplicate or missing committed events; they do not promise historical HTML replay.

## Work Guidance

- Adding a wire event requires a discriminated payload schema, server mapping, client session handling, and executable tests.
- Size limits count encoded UTF-8 bytes after JSON serialization.

## Verification

- `pnpm --filter @workspace/contracts typecheck`
- `pnpm --filter @workspace/contracts lint`
- `pnpm --filter @workspace/contracts format:check`
- `pnpm --filter @workspace/contracts test`

## Child DOX Index

- None.
