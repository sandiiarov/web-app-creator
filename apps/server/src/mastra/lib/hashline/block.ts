import { STRUCTURAL_CLOSER_RE } from './apply.ts'
import {
  blockSingleLineMessage,
  blockUnresolvedMessage,
  insertAfterBlockCloserLoweredWarning,
  insertAfterBlockUnresolvedLoweredWarning,
} from './messages.ts'
import type { BlockResolution, BlockResolver, Cursor, Edit } from './types.ts'

export interface ResolveBlockEditsOptions {
  onResolved?: (resolution: BlockResolution) => void
  onUnresolved?: 'drop' | 'throw'
  onWarning?: (message: string) => void
}

function hasBlockEdit(edits: readonly Edit[]): boolean {
  return edits.some((edit) => edit.kind === 'block')
}

export function resolveBlockEdits(
  edits: readonly Edit[],
  text: string,
  path: string,
  resolver: BlockResolver | undefined,
  options: ResolveBlockEditsOptions = {},
): readonly Edit[] {
  if (!hasBlockEdit(edits)) return edits
  const onUnresolved = options.onUnresolved ?? 'throw'
  const resolved: Edit[] = []
  let synthIndex = 0

  for (const edit of edits) {
    if (edit.kind !== 'block') {
      resolved.push(edit)
      continue
    }

    const op =
      edit.mode === 'insert_after'
        ? 'insert_after'
        : edit.payloads.length === 0
          ? 'delete'
          : 'replace'
    const span = resolver
      ? resolver({ line: edit.anchor.line, path, text })
      : null

    if (span === null) {
      if (op === 'insert_after') {
        const anchorText = text.split('\n')[edit.anchor.line - 1]
        const isCloser =
          anchorText !== undefined && STRUCTURAL_CLOSER_RE.test(anchorText)
        options.onWarning?.(
          isCloser
            ? insertAfterBlockCloserLoweredWarning(edit.anchor.line)
            : insertAfterBlockUnresolvedLoweredWarning(edit.anchor.line),
        )
        // Lower to plain insert after N:
        for (const payload of edit.payloads) {
          resolved.push({
            cursor: {
              anchor: { line: edit.anchor.line },
              kind: 'after_anchor',
            },
            index: synthIndex++,
            kind: 'insert',
            lineNum: edit.lineNum,
            text: payload,
          })
        }
        continue
      }

      if (onUnresolved === 'drop') continue

      const fileLines = text.split('\n')
      throw new Error(
        blockUnresolvedMessage(
          edit.anchor.line,
          op === 'delete' ? 'delete' : 'replace',
          fileLines,
        ),
      )
    }

    if (span.start === span.end) {
      throw new Error(blockSingleLineMessage(edit.anchor.line, op))
    }

    options.onResolved?.({
      anchorLine: edit.anchor.line,
      end: span.end,
      op,
      start: span.start,
    })

    if (op === 'delete') {
      for (let l = span.start; l <= span.end; l++) {
        resolved.push({
          anchor: { line: l },
          index: synthIndex++,
          kind: 'delete',
          lineNum: edit.lineNum,
        })
      }
    } else if (op === 'replace') {
      const cursor: Cursor = {
        anchor: { line: span.start },
        kind: 'before_anchor',
      }
      for (const payload of edit.payloads) {
        resolved.push({
          cursor: cloneCursor(cursor),
          index: synthIndex++,
          kind: 'insert',
          lineNum: edit.lineNum,
          mode: 'replacement',
          text: payload,
        })
      }
      for (let l = span.start; l <= span.end; l++) {
        resolved.push({
          anchor: { line: l },
          index: synthIndex++,
          kind: 'delete',
          lineNum: edit.lineNum,
        })
      }
    } else if (op === 'insert_after') {
      for (const payload of edit.payloads) {
        resolved.push({
          blockStart: span.start,
          cursor: { anchor: { line: span.end }, kind: 'after_anchor' },
          index: synthIndex++,
          kind: 'insert',
          lineNum: edit.lineNum,
          text: payload,
        })
      }
    }
  }

  return resolved
}

function cloneCursor(c: Cursor): Cursor {
  if (c.kind === 'before_anchor' || c.kind === 'after_anchor') {
    return { anchor: { ...c.anchor }, kind: c.kind }
  }
  return c
}
