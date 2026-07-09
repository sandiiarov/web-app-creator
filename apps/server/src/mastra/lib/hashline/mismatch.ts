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
