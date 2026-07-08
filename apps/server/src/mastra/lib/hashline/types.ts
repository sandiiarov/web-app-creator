/**
 * Pure data types shared across the hashline parser, applier, and patcher.
 * NOTE: jiti ESM loader requires value exports at runtime, so each type
 * is declared as both an interface/type AND re-exported as a runtime marker.
 */

// Re-export all types using side-effect-friendly pattern
// Each type export is paired with a const so jiti/Node sees named exports.

export interface Anchor {
  line: number
}

export interface ApplyResult {
  blockResolutions?: BlockResolution[]
  firstChangedLine?: number
  text: string
  warnings?: string[]
}

export interface BlockResolution {
  anchorLine: number
  end: number
  op: 'replace' | 'delete' | 'insert_after'
  start: number
}

export type BlockResolver = (request: BlockResolverRequest) => BlockSpan | null

export interface BlockResolverRequest {
  line: number
  path: string
  text: string
}

export interface BlockSpan {
  end: number
  start: number
}

export interface CompactDiffOptions {
  maxAddedRunContext?: number
  maxUnchangedRun?: number
}

export interface CompactDiffPreview {
  addedLines: number
  preview: string
  removedLines: number
}

export type Cursor =
  | { kind: 'after_anchor'; anchor: Anchor }
  | { kind: 'before_anchor'; anchor: Anchor }
  | { kind: 'bof' }
  | { kind: 'eof' }

export type Edit =
  | {
      kind: 'block'
      anchor: Anchor
      payloads: string[]
      mode?: 'insert_after'
      lineNum: number
      index: number
    }
  | {
      kind: 'delete'
      anchor: Anchor
      lineNum: number
      index: number
      oldAssertion?: string
    }
  | {
      kind: 'insert'
      cursor: Cursor
      text: string
      lineNum: number
      index: number
      mode?: 'replacement'
      blockStart?: number
    }

export interface ParsedRange {
  end: Anchor
  start: Anchor
}

export interface SplitOptions {
  cwd?: string
  path?: string
}

export interface StreamOptions {
  maxChunkBytes?: number
  maxChunkLines?: number
  startLine?: number
}

// Runtime marker — required by jiti ESM loader so Node accepts named type exports
export const _typesRuntime = true as const
