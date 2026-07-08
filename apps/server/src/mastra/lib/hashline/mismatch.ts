import {
  HL_FILE_HASH_EXAMPLES,
  HL_FILE_HASH_SEP,
  HL_FILE_PREFIX,
  HL_FILE_SUFFIX,
} from './format.ts'
import { formatAnchoredContext } from './messages.ts'

const LINE_REF_RE = /^\s*[>+\-*]*\s*(\d+)(?::.*)?\s*$/

export interface MismatchDetails {
  actualFileHash: string
  anchorLines?: readonly number[]
  expectedFileHash: string
  fileLines: string[]
  hashRecognized?: boolean
  path?: string
}

export class MismatchError extends Error {
  readonly actualFileHash: string
  readonly anchorLines: readonly number[]
  readonly expectedFileHash: string
  readonly fileLines: string[]
  readonly hashRecognized: boolean
  readonly path: string | undefined

  get displayMessage(): string {
    return MismatchError.formatDisplayMessage({
      path: this.path,
      expectedFileHash: this.expectedFileHash,
      actualFileHash: this.actualFileHash,
      fileLines: this.fileLines,
      anchorLines: this.anchorLines,
      hashRecognized: this.hashRecognized,
    })
  }

  constructor(details: MismatchDetails) {
    super(MismatchError.formatMessage(details))
    this.name = 'MismatchError'
    this.path = details.path
    this.expectedFileHash = details.expectedFileHash
    this.actualFileHash = details.actualFileHash
    this.fileLines = details.fileLines
    this.anchorLines = details.anchorLines ?? []
    this.hashRecognized = details.hashRecognized ?? true
  }

  static formatDisplayMessage(details: MismatchDetails): string {
    const { fileLines, anchorLines } = details
    const header = MismatchError.formatMessage(details)
    const context = formatAnchoredContext(
      anchorLines && anchorLines.length > 0 ? anchorLines : [],
      fileLines,
    )
    return context.length > 0 ? `${header}\n\n${context.join('\n')}` : header
  }

  static formatMessage(details: MismatchDetails): string {
    const { path, expectedFileHash, actualFileHash, hashRecognized } = details
    const pathPart = path ? ` for ${path}` : ''
    const recognized =
      hashRecognized === false
        ? ' (no read snapshot for this tag — it was likely fabricated or carried over from a prior session)'
        : ''
    return (
      `Hash mismatch${pathPart}: expected #${expectedFileHash}, got #${actualFileHash}.` +
      ` Re-read the file and retry with fresh anchors.${recognized}`
    )
  }
}

export function formatFullAnchorRequirement(raw?: string): string {
  const received = raw === undefined ? '' : ` Received ${JSON.stringify(raw)}.`
  return (
    `a bare line number from read/search output plus the section header content-hash tag ` +
    `(for example ${HL_FILE_PREFIX}src/foo.ts${HL_FILE_HASH_SEP}${HL_FILE_HASH_EXAMPLES[0]}${HL_FILE_SUFFIX} and line "160")${received}`
  )
}

export function parseTag(ref: string): { line: number } {
  const match = ref.match(LINE_REF_RE)
  if (!match) {
    throw new Error(
      `Invalid line reference. Expected ${formatFullAnchorRequirement(ref)}.`,
    )
  }
  const line = Number.parseInt(match[1]!, 10)
  if (line < 1)
    throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`)
  return { line }
}
