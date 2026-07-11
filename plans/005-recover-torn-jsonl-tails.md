# Plan 005: Preserve valid JSONL history after torn writes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only files listed in Scope. If a STOP condition occurs, stop and report; do not improvise. Make exactly one commit for this plan. When done, update only plan 005's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9b8d66b6..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/server/src/mastra/lib/project-store.test.ts apps/server/src/mastra/AGENTS.md`
>
> Plan 004 must already be `DONE`; its only expected overlap is `apps/server/src/mastra/AGENTS.md`. Preserve that outbound-fetch contract. For project-store source/tests, compare Current state against live code and STOP on a mismatch. `plans/README.md` is excluded because the status ledger is expected to change.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/004-harden-scrape-image-fetches.md`
- **Category**: bug
- **Planned at**: commit `9b8d66b6`, 2026-07-11

## Why this matters

Client and agent histories are append-only JSONL so completed events survive a process crash. The current reader wraps the entire file parse in one catch, so one torn final record returns an empty array and discards every valid earlier record during hydration and agent replay. The reader should preserve a complete prefix only for an unterminated invalid tail, and the first later append after restart should remove that tail before writing a new complete line.

## Current state

Applicable contracts:

- `apps/server/src/mastra/AGENTS.md` defines `client-messages.jsonl` and `agent-messages.jsonl` as append-only per-event/per-step durable history.
- `getProject` replays client entries into turns, while `readAgentRawByTurn` takes the last complete snapshot per turn.
- Per-project writes must remain serialized through `chainProjectWrite`; do not replace append-only logs with full-file rewrites.
- Tests belong in the existing `append-only debug logs` describe block in `project-store.test.ts`.

The reader is all-or-nothing:

```ts
// apps/server/src/mastra/lib/project-store.ts:902-912
async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}
```

Both high-frequency logs use this helper:

```ts
// apps/server/src/mastra/lib/project-store.ts:526-562
export async function readAgentMessages(id: string) {
  return readJsonl(join(projectDir(id), AGENT_MESSAGES_JSONL))
}

export async function readClientMessages(id: string) {
  return readJsonl(join(projectDir(id), CLIENT_MESSAGES_JSONL))
}
```

Appends are serialized and write one JSON value plus newline (`project-store.ts:471-500`). A process termination can still leave a partial final write. If a later process simply appends to that non-newline tail, it would join partial and valid JSON, so read recovery alone is incomplete.

## Target contract

- Missing/unreadable JSONL still returns `[]` as today.
- Blank lines remain ignored.
- A valid last record is accepted whether or not the file ends with a newline.
- If and only if the final nonblank record is invalid **and the file does not end with a newline**, treat it as a torn tail and return all complete valid records before it.
- An invalid record before another record, or an invalid final record terminated by newline, remains committed corruption and returns `[]`; do not silently skip interior corruption and risk replaying events under the wrong turn.
- Before the first append to each JSONL file in a process, inspect the existing tail once. If it is an invalid unterminated record, truncate only that tail back to the last newline. If the unterminated final record is valid, insert the missing separator before the next append rather than deleting it.
- Keep append operations serialized and avoid reading the whole log before every append. One startup/first-append preparation per file is acceptable; clear its prepared marker if preparation/append fails.
- Do not change the vision JSON array or legacy JSON fallback behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `pnpm --filter @workspace/server test -- src/mastra/lib/project-store.test.ts` | exit 0; all project-store tests pass |
| Server checks | `pnpm --filter @workspace/server lint && pnpm --filter @workspace/server typecheck` | exit 0, no errors |
| Full gate | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run fallow:dead-code` | every command exits 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Scope

**Implementation files in scope**:

- `apps/server/src/mastra/lib/project-store.ts`
- `apps/server/src/mastra/lib/project-store.test.ts`
- `apps/server/src/mastra/AGENTS.md`

**Administrative file in scope**:

- `plans/README.md` — update only plan 005's status cell.

**Out of scope**:

- Changing JSONL schemas, event replay semantics, turn IDs, legacy fallback files, or vision JSON format.
- Full-file compaction, checksums, fsync policy, file locking across processes, or database migration.
- Silently skipping malformed interior/terminated records.
- Refactoring route streaming or changing the public API.
- Changing `chainProjectWrite` error-propagation semantics; record that separately if investigated.

## Git workflow

- Work only after plan 004 is `DONE`.
- Produce exactly one commit: `fix(project-store): recover torn JSONL tails`.
- Include only files in Scope. Do not push or open a PR.

## Steps

### Step 1: Extract a deterministic JSONL prefix parser

In `project-store.ts`, separate file I/O failure from line parsing:

1. Read the file in a narrow try/catch; missing/unreadable remains `[]`.
2. Parse nonblank lines in order into a result array.
3. On parse failure, determine whether this is the last nonblank segment and the raw file lacks a trailing newline.
4. Return the accumulated prefix only for that torn-tail case.
5. Return `[]` for every other parse failure.
6. Accept a valid final record without newline.

A private pure helper is preferred so edge cases are easy to reason about, but do not export a new package API solely for tests.

Add tests by writing files under the created test project directory:

- client log with two complete entries plus an invalid unterminated tail returns the two entries;
- agent log with complete snapshots plus an invalid unterminated tail preserves snapshots and `readAgentRawByTurn` uses the last complete one;
- valid final JSON without newline is retained;
- malformed interior line returns `[]`;
- malformed final line with newline returns `[]`;
- `getProject` hydrates the valid client prefix instead of legacy/empty history.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/mastra/lib/project-store.test.ts
pnpm --filter @workspace/server typecheck
```

Expected: all tests pass; valid-prefix recovery is demonstrated through public store functions.

### Step 2: Repair a torn tail once before future appends

Still inside the existing per-project write chain:

1. Add a module-local set/map keyed by JSONL file path to track files prepared in this process.
2. Before the first `appendFile` for client or agent JSONL, inspect existing content.
3. If it ends with newline or is empty, mark prepared and append normally.
4. If its final unterminated segment parses successfully, preserve it and prepend exactly one newline separator to the new record.
5. If that segment is invalid, truncate from the start of the invalid tail (the byte after the last newline) before appending the new complete record.
6. Perform preparation and append under `chainProjectWrite`, and remove the prepared marker if either operation fails.
7. Do not perform full-file inspection on every event after successful preparation.

Use byte-safe truncation boundaries. JSONL delimiters are ASCII newline bytes; do not derive a byte offset from a JavaScript UTF-16 character index when earlier JSON can contain non-ASCII content. Either operate on `Buffer` or convert the prefix back to byte length explicitly.

Add tests where the file is prepared manually **before its first append call in the module process**:

- complete prefix + torn tail + append produces prefix + new entry and a newline-terminated parseable file;
- valid unterminated final record + append preserves both records with a separator;
- Unicode in earlier records does not cause truncation at the wrong byte;
- concurrent appends after one repair remain ordered/non-interleaved under the existing concurrency test.

**Verify**:

```bash
pnpm --filter @workspace/server test -- src/mastra/lib/project-store.test.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
```

Expected: all tests pass; on-disk repaired files contain only complete newline-separated JSON records.

### Step 3: Synchronize DOX, run all gates, and commit

Update `apps/server/src/mastra/AGENTS.md` in the append-only history contract. State that readers preserve complete prefixes after an unterminated torn tail and first append after restart repairs only that tail; committed/interior corruption is not silently skipped.

Run all gates, inspect scope, update plan status, and make the one commit.

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

Expected: every command exits 0; only scoped files are changed before commit.

## Test plan

Model tests after the current `append-only debug logs` suite. Use actual project files and public read/append functions; do not mock `readFile`/`appendFile`. Required cases:

1. missing file;
2. normal newline-terminated records;
3. valid final record without newline;
4. invalid unterminated final record preserves prefix;
5. malformed interior/terminated record remains fail-closed;
6. client hydration from recovered prefix;
7. agent last-snapshot replay from recovered prefix;
8. first append truncates a torn tail only;
9. first append separates a valid non-newline record;
10. Unicode byte boundary;
11. concurrent append behavior remains intact.

## Done criteria

- [ ] One torn final record no longer erases complete client or agent history.
- [ ] Valid no-newline final records are preserved.
- [ ] Interior/terminated corruption still returns `[]` rather than being silently skipped.
- [ ] First append after restart repairs an invalid tail or separates a valid one.
- [ ] Tail preparation runs once per file/process, not per event.
- [ ] Existing serialization and legacy fallback behavior remain intact.
- [ ] DOX records the live recovery contract.
- [ ] Focused and full gates pass, including Fallow.
- [ ] Exactly one commit exists with message `fix(project-store): recover torn JSONL tails`.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Plan 004 is not `DONE` or the baseline is red.
- A JSONL record can intentionally contain raw unescaped newline bytes outside JSON strings.
- Correct repair requires rewriting complete valid history rather than truncating one invalid tail.
- Byte-safe truncation cannot be implemented with current Node filesystem APIs in Scope.
- Existing code permits multiple OS processes to append the same project log concurrently; this plan does not add inter-process locking.
- A verification command fails twice after a reasonable scoped correction.

## Maintenance notes

JSONL resilience depends on every writer emitting one compact JSON value followed by `\n`. If logs later gain compaction, multi-process writers, or checksums, revisit both read recovery and first-append preparation together. `chainProjectWrite` currently prevents in-process interleaving; its error-reporting behavior is deliberately outside this plan and should not be changed incidentally.
