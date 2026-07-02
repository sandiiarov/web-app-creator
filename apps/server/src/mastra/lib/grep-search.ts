/**
 * In-memory line-based pattern search for `/index.html`.
 * Searches a single string. Regex by default,
 * literal mode on request; case-insensitive option; N lines of context around
 * each match; per-line truncation + match cap.
 */

const DEFAULT_CONTEXT = 0
const DEFAULT_LIMIT = 100
const MAX_LINE_LENGTH = 500

export interface GrepMatch {
  /** 1-indexed line number. */
  lineNumber: number
  text: string
}

export interface GrepOptions {
  /** Lines of context before/after each match (default 0). */
  context?: number
  /** Case-insensitive (default false). */
  ignoreCase?: boolean
  /** Max matches to return (default 100). */
  limit?: number
  /** Treat pattern as a literal string (default false → regex). */
  literal?: boolean
}

export interface GrepResult {
  matchCount: number
  matches: GrepMatch[]
  matchLimitReached: boolean
  notices: string[]
  output: string
  truncatedLines: boolean
}

export function grepHtml(
  content: string,
  pattern: string,
  options: GrepOptions = {},
): GrepResult {
  const contextValue = Math.max(0, options.context ?? DEFAULT_CONTEXT)
  const effectiveLimit = Math.max(1, options.limit ?? DEFAULT_LIMIT)
  const ignoreCase = options.ignoreCase ?? false
  const literal = options.literal ?? false

  let regex: RegExp
  try {
    regex = new RegExp(
      literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern,
      ignoreCase ? 'i' : '',
    )
  } catch (error) {
    return {
      matchCount: 0,
      matches: [],
      matchLimitReached: false,
      notices: [
        `Invalid regex: ${error instanceof Error ? error.message : String(error)}`,
      ],
      output: '',
      truncatedLines: false,
    }
  }

  const lines = normalizeLines(content)
  const matches: GrepMatch[] = []
  let truncatedLines = false
  let matchLimitReached = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (regex.test(line)) {
      matches.push({ lineNumber: i + 1, text: line })
      if (matches.length >= effectiveLimit) {
        matchLimitReached = true
        break
      }
    }
  }

  const notices: string[] = []
  if (matchLimitReached) {
    notices.push(
      `${effectiveLimit} matches limit reached. Use a larger limit or refine the pattern.`,
    )
  }

  if (matches.length === 0) {
    return {
      matchCount: 0,
      matches: [],
      matchLimitReached: false,
      notices: [],
      output: 'No matches found',
      truncatedLines: false,
    }
  }

  const outputLines: string[] = []
  for (const match of matches) {
    if (contextValue === 0) {
      const { text, wasTruncated } = truncateLine(match.text)
      if (wasTruncated) truncatedLines = true
      outputLines.push(`${match.lineNumber}: ${text}`)
    } else {
      const start = Math.max(1, match.lineNumber - contextValue)
      const end = Math.min(lines.length, match.lineNumber + contextValue)
      for (let current = start; current <= end; current++) {
        const lineText = lines[current - 1] ?? ''
        const { text, wasTruncated } = truncateLine(lineText)
        if (wasTruncated) truncatedLines = true
        const isMatchLine = current === match.lineNumber
        outputLines.push(
          isMatchLine ? `${current}: ${text}` : `${current}- ${text}`,
        )
      }
    }
  }

  if (truncatedLines) {
    notices.push(
      `Some lines truncated to ${MAX_LINE_LENGTH} chars. Use read to see full lines.`,
    )
  }

  return {
    matchCount: matches.length,
    matches,
    matchLimitReached,
    notices,
    output: notices.length
      ? `${outputLines.join('\n')}\n\n[${notices.join('. ')}]`
      : outputLines.join('\n'),
    truncatedLines,
  }
}

function normalizeLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function truncateLine(line: string): { text: string; wasTruncated: boolean } {
  if (line.length <= MAX_LINE_LENGTH) {
    return { text: line, wasTruncated: false }
  }
  return {
    text: `${line.slice(0, MAX_LINE_LENGTH)}... [truncated]`,
    wasTruncated: true,
  }
}
