import type { ApplyResult, Edit } from './types.ts'

/** An atomic edit operation with its target line for bottom-up sorting. */
interface AtomicOp {
  /** 1-indexed anchor line used for bottom-up sorting. 0 for bof, Infinity for eof. */
  anchorLine: number
  /** Number of lines to delete (for replace and delete ops). */
  deleteCount: number
  /** Stable sort tiebreaker (original index in the edit list). */
  index: number
  kind: 'replace' | 'insert_before' | 'insert_after' | 'bof' | 'eof' | 'delete'
  /** Payload lines to insert. */
  payload: string[]
}

// ── Atomic operation types ─────────────────────────────────────────────────

type DeleteEdit = Extract<Edit, { kind: 'delete' }>

// ── Landing-shift logic ────────────────────────────────────────────────────

/** Regex matching structural closers (common across many languages). */
export const STRUCTURAL_CLOSER_RE =
  /^\s*(?:end|}\)?|\]\)?|\}>|end\b|\/\*\*?|\*\/|```)\s*$/

export function applyEdits(
  oldText: string,
  edits: readonly Edit[],
): ApplyResult {
  // Step 1: Group edits into atomic operations
  let ops = groupAtomicOps(edits)

  // Step 2: Merge consecutive same-anchor insert ops (batch payloads)
  ops = mergeConsecutiveOps(ops)

  const warnings: string[] = []
  let fileLines = oldText.split('\n')

  // Step 2b: Self-heal replacement boundaries (drop duplicated trailing closers).
  const repair = repairReplacementBoundaries(ops, fileLines)
  ops = repair.ops
  if (repair.warnings.length > 0) warnings.push(...repair.warnings)

  // Step 3: Sort operations bottom-up (descending anchorLine) with stable tiebreaker.
  // Bottom-up processing prevents line-number drift: edits at higher line numbers
  // are applied first, so they don't shift the positions of lower-line edits.
  ops.sort((a, b) => {
    if (b.anchorLine !== a.anchorLine) return b.anchorLine - a.anchorLine
    return a.index - b.index
  })

  // Step 4: Apply each operation against the file
  for (const op of ops) {
    switch (op.kind) {
      case 'bof': {
        if (fileLines.length === 1 && fileLines[0] === '') {
          fileLines = [...op.payload]
        } else {
          fileLines.splice(0, 0, ...op.payload)
        }
        break
      }

      case 'delete': {
        const idx = op.anchorLine - 1
        const phantomLine = trailingPhantomLine(fileLines)
        if (idx !== phantomLine && idx >= 0 && idx < fileLines.length) {
          fileLines.splice(idx, op.deleteCount)
        }
        break
      }

      case 'eof': {
        const hasTrailingNewline =
          fileLines.length > 0 && fileLines[fileLines.length - 1] === ''
        const idx = hasTrailingNewline ? fileLines.length - 1 : fileLines.length
        fileLines.splice(idx, 0, ...op.payload)
        break
      }

      case 'insert_after': {
        const { landingLine, crossed } = computeInsertAfterLanding(
          op.anchorLine,
          op.payload[0] ?? '',
          fileLines,
        )
        if (crossed > 0) {
          warnings.push(
            `INS.POST ${op.anchorLine}: landing shifted from line ${op.anchorLine} to ${landingLine} (${crossed} closer${crossed === 1 ? '' : 's'} skipped)`,
          )
        }
        fileLines.splice(landingLine, 0, ...op.payload)
        break
      }

      case 'insert_before': {
        const idx = op.anchorLine - 1
        fileLines.splice(idx, 0, ...op.payload)
        break
      }

      case 'replace': {
        const deleteStart = op.anchorLine - 1
        if (op.deleteCount > 0) {
          fileLines.splice(deleteStart, op.deleteCount, ...op.payload)
        } else {
          // No deletes — treat as insert before
          fileLines.splice(deleteStart, 0, ...op.payload)
        }
        break
      }
    }
  }

  const result = fileLines.join('\n')
  const firstChangedLine = findFirstChangedLine(oldText, result)

  return {
    firstChangedLine,
    text: result,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

function computeInsertAfterLanding(
  anchorLine: number,
  firstPayloadLine: string,
  fileLines: readonly string[],
): { crossed: number; landingLine: number } {
  const anchorDepth = indentDepth(fileLines[anchorLine - 1] ?? '')
  const bodyDepth = indentDepth(firstPayloadLine)
  if (bodyDepth >= anchorDepth) return { crossed: 0, landingLine: anchorLine }
  let landingLine = anchorLine
  let crossed = 0
  while (landingLine < fileLines.length) {
    const nextLine = fileLines[landingLine]
    if (!nextLine) break
    if (indentDepth(nextLine) <= bodyDepth) break
    if (STRUCTURAL_CLOSER_RE.test(nextLine.trim())) {
      landingLine++
      crossed++
    } else {
      break
    }
  }
  return { crossed, landingLine }
}

function findFirstChangedLine(
  before: string,
  after: string,
): number | undefined {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) return i + 1
  }
  return undefined
}

// ── Group edits into atomic operations ─────────────────────────────────────

/**
 * Group a flat list of edits into atomic operations, preserving replacement
 * groups (inserts + deletes) as single operations.
 */
function groupAtomicOps(edits: readonly Edit[]): AtomicOp[] {
  const ops: AtomicOp[] = []
  let i = 0

  while (i < edits.length) {
    const edit = edits[i]!

    // Block edits must be resolved before reaching the applier
    if (edit.kind === 'block') {
      throw new Error(
        'Unresolved block edit reached applier; run resolveBlockEdits first.',
      )
    }

    // ── Replacement group: consecutive "replacement" inserts + consecutive deletes ──
    if (
      edit.kind === 'insert' &&
      edit.mode === 'replacement' &&
      edit.cursor.kind === 'before_anchor'
    ) {
      const anchorLine = edit.cursor.anchor.line
      const sourceLineNum = edit.lineNum
      const payload: string[] = []
      let insertEnd = i
      while (insertEnd < edits.length) {
        const e = edits[insertEnd]!
        if (
          !(
            e.kind === 'insert' &&
            e.mode === 'replacement' &&
            e.cursor.kind === 'before_anchor' &&
            e.cursor.anchor.line === anchorLine &&
            e.lineNum === sourceLineNum
          )
        )
          break
        payload.push(e.text)
        insertEnd++
      }

      // Collect consecutive deletes starting at anchorLine
      const deleteEdits: DeleteEdit[] = []
      let expectedLine = anchorLine
      let deleteEnd = insertEnd
      while (deleteEnd < edits.length) {
        const e = edits[deleteEnd]!
        if (
          !(
            e.kind === 'delete' &&
            e.anchor.line === expectedLine &&
            e.lineNum === sourceLineNum
          )
        )
          break
        deleteEdits.push(e)
        expectedLine++
        deleteEnd++
      }

      ops.push({
        anchorLine,
        deleteCount: deleteEdits.length,
        index: edit.index,
        kind: 'replace',
        payload,
      })
      i = deleteEnd
      continue
    }

    // ── Individual insert ──
    if (edit.kind === 'insert') {
      const cursor = edit.cursor
      if (cursor.kind === 'bof') {
        ops.push({
          anchorLine: 0,
          deleteCount: 0,
          index: edit.index,
          kind: 'bof',
          payload: [edit.text],
        })
      } else if (cursor.kind === 'eof') {
        ops.push({
          anchorLine: Infinity,
          deleteCount: 0,
          index: edit.index,
          kind: 'eof',
          payload: [edit.text],
        })
      } else if (cursor.kind === 'before_anchor') {
        ops.push({
          anchorLine: cursor.anchor.line,
          deleteCount: 0,
          index: edit.index,
          kind: 'insert_before',
          payload: [edit.text],
        })
      } else if (cursor.kind === 'after_anchor') {
        ops.push({
          anchorLine: cursor.anchor.line,
          deleteCount: 0,
          index: edit.index,
          kind: 'insert_after',
          payload: [edit.text],
        })
      }
      i++
      continue
    }

    // ── Standalone delete ──
    if (edit.kind === 'delete') {
      ops.push({
        anchorLine: edit.anchor.line,
        deleteCount: 1,
        index: edit.index,
        kind: 'delete',
        payload: [],
      })
      i++
      continue
    }

    i++
  }

  return ops
}

function indentDepth(line: string): number {
  let count = 0
  for (const ch of line) {
    if (ch === ' ') count++
    else if (ch === '\t') count += 2
    else break
  }
  return count
}

/**
 * Merge consecutive atomic operations that share the same anchor and kind,
 * batching their payloads together. This ensures multiple INS.POST payload
 * lines at the same anchor are inserted in one splice call, preventing
 * the duplication bug seen when inserting each line individually.
 */
function mergeConsecutiveOps(ops: AtomicOp[]): AtomicOp[] {
  if (ops.length === 0) return ops
  const merged: AtomicOp[] = []
  let current = ops[0]!

  for (let i = 1; i < ops.length; i++) {
    const next = ops[i]!
    const sameKind = current.kind === next.kind
    const sameAnchor =
      current.anchorLine === next.anchorLine &&
      (current.kind === 'insert_after' ||
        current.kind === 'insert_before' ||
        current.kind === 'bof' ||
        current.kind === 'eof')
    if (sameKind && sameAnchor) {
      // Merge payloads; keep the lower index for stability
      current = {
        ...current,
        index: Math.min(current.index, next.index),
        payload: [...current.payload, ...next.payload],
      }
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)
  return merged
}

// ── Main apply function ────────────────────────────────────────────────────

/**
 * Self-heal replacement boundaries. A common model mistake is to restate the
 * unchanged structural closer that sits immediately AFTER a replaced range as
 * the last body row of a `SWAP N.=M:`. Keeping it would duplicate that closer.
 * When the last payload line exactly equals the line just past the range AND
 * that line is a structural closer, drop the duplicate and warn.
 *
 * Conservative by design: it only fires on an exact (whitespace-sensitive)
 * match with a structural closer, so intentionally repeated statements and
 * differently-indented nested closers are left intact.
 */
function repairReplacementBoundaries(
  ops: AtomicOp[],
  fileLines: readonly string[],
): { ops: AtomicOp[]; warnings: string[] } {
  const warnings: string[] = []
  const repaired = ops.map((op) => {
    if (
      op.kind !== 'replace' ||
      op.deleteCount === 0 ||
      op.payload.length === 0
    )
      return op
    const afterIdx = op.anchorLine - 1 + op.deleteCount // 0-indexed line immediately after the range
    const afterLine = fileLines[afterIdx]
    if (afterLine === undefined) return op
    const lastPayload = op.payload[op.payload.length - 1]
    if (lastPayload !== afterLine) return op
    if (!STRUCTURAL_CLOSER_RE.test(afterLine.trim())) return op
    warnings.push(
      `SWAP ${op.anchorLine}.=${op.anchorLine + op.deleteCount - 1}: dropped a trailing body row that duplicated the unchanged closing line ${op.anchorLine + op.deleteCount} ("${afterLine.trim()}"). Keep only the lines that change; the range already excludes the line after it.`,
    )
    return { ...op, payload: op.payload.slice(0, -1) }
  })
  return { ops: repaired, warnings }
}

function trailingPhantomLine(fileLines: readonly string[]): number {
  return fileLines.length > 1 && fileLines[fileLines.length - 1] === ''
    ? fileLines.length
    : 0
}
