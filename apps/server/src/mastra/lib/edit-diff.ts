/**
 * Fuzzy text matching + safe edit application for `/index.html`.
 * Operates purely on strings. Semantics: exact match first, then a normalized
 * fuzzy pass, then an indentation-insensitive fallback; edits must be unique
 * and non-overlapping; a no-op replacement is an error.
 */

export interface Edit {
  newText: string
  oldText: string
}

export interface FuzzyMatchResult {
  contentForReplacement: string
  found: boolean
  index: number
  matchLength: number
  usedFuzzyMatch: boolean
}

interface DiffLine {
  newLine?: number
  oldLine?: number
  text: string
  type: 'add' | 'context' | 'remove'
}

interface LineSpan {
  end: number
  start: number
}

interface MatchedEdit {
  editIndex: number
  matchIndex: number
  matchLength: number
  newText: string
}

type MatchMode = 'exact' | 'fuzzy' | 'indent'

interface MatchModeResult {
  found: boolean
  mode: MatchMode
}

interface TextReplacement {
  matchIndex: number
  matchLength: number
  newText: string
}

/**
 * Apply one or more edits to the raw store string. All oldText matches are
 * resolved against the original document content, not incrementally.
 */
export function applyEdits(currentHtml: string, edits: Edit[]): string {
  const { bom, text } = stripBom(currentHtml)
  const originalEnding = detectLineEnding(text)
  const normalizedContent = normalizeToLF(text)
  const { newContent } = applyEditsToNormalizedContent(normalizedContent, edits)
  return bom + restoreLineEndings(newContent, originalEnding)
}

/** Count changed lines between old and new content (rough). */
export function countChangedLines(oldContent: string, newContent: string) {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const max = Math.max(oldLines.length, newLines.length)
  let changed = 0
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) changed++
  }
  return changed
}

export function detectLineEnding(content: string): '\n' | '\r\n' {
  const crlfIdx = content.indexOf('\r\n')
  const lfIdx = content.indexOf('\n')
  if (lfIdx === -1) return '\n'
  if (crlfIdx === -1) return '\n'
  return crlfIdx < lfIdx ? '\r\n' : '\n'
}

/**
 * Find oldText in content: exact match first, then fuzzy-normalized match.
 * Returns offsets in whichever content space matched (original or normalized).
 */
export function fuzzyFindText(
  content: string,
  oldText: string,
): FuzzyMatchResult {
  const exactIndex = content.indexOf(oldText)
  if (exactIndex !== -1) {
    return {
      contentForReplacement: content,
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
    }
  }

  const fuzzyContent = normalizeForFuzzyMatch(content)
  const fuzzyOldText = normalizeForFuzzyMatch(oldText)
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText)

  if (fuzzyIndex === -1) {
    return {
      contentForReplacement: content,
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false,
    }
  }

  return {
    contentForReplacement: fuzzyContent,
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true,
  }
}

/** Generate a display-oriented line diff with line numbers and context. */
export function generateDiffString(
  oldContent: string,
  newContent: string,
  contextLines = 4,
): { diff: string; firstChangedLine: number | undefined } {
  const lines = buildLineDiff(oldContent, newContent)
  const hunks = createDiffHunks(lines, contextLines)
  const firstChange = lines.find((line) => line.type !== 'context')
  const firstChangedLine =
    firstChange?.type === 'add'
      ? firstChange.newLine
      : firstChange?.type === 'remove'
        ? firstChange.newLine
        : undefined
  const width = getLineNumberWidth(oldContent, newContent)
  const output: string[] = []

  for (let i = 0; i < hunks.length; i++) {
    if (i > 0) output.push(` ${''.padStart(width)} ...`)
    for (const line of lines.slice(hunks[i]!.start, hunks[i]!.end)) {
      const prefix =
        line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      const lineNumber = line.type === 'add' ? line.newLine : line.oldLine
      output.push(
        `${prefix}${String(lineNumber ?? '').padStart(width)} ${line.text}`,
      )
    }
  }

  return { diff: output.join('\n'), firstChangedLine }
}

/** Generate a compact unified patch for display/debugging. */
export function generateUnifiedPatch(
  path: string,
  oldContent: string,
  newContent: string,
  contextLines = 4,
): string {
  const lines = buildLineDiff(oldContent, newContent)
  const hunks = createDiffHunks(lines, contextLines)
  if (!hunks.length) return ''

  const output = [`--- ${path}`, `+++ ${path}`]
  for (const hunk of hunks) {
    const hunkLines = lines.slice(hunk.start, hunk.end)
    const oldStart = firstLineNumber(hunkLines, 'oldLine') ?? 1
    const newStart = firstLineNumber(hunkLines, 'newLine') ?? 1
    const oldCount = hunkLines.filter((line) => line.type !== 'add').length
    const newCount = hunkLines.filter((line) => line.type !== 'remove').length
    output.push(
      `@@ -${formatPatchRange(oldStart, oldCount)} +${formatPatchRange(newStart, newCount)} @@`,
    )
    for (const line of hunkLines) {
      const prefix =
        line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      output.push(`${prefix}${line.text}`)
    }
  }

  return output.join('\n')
}

/**
 * Normalize text for fuzzy matching: NFKC, strip trailing whitespace per line,
 * collapse smart quotes / dashes / special spaces to ASCII.
 */
export function normalizeForFuzzyMatch(text: string): string {
  return text
    .normalize('NFKC')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ')
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function restoreLineEndings(
  text: string,
  ending: '\n' | '\r\n',
): string {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text
}

export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith('\uFEFF')
    ? { bom: '\uFEFF', text: content.slice(1) }
    : { bom: '', text: content }
}

/**
 * Apply one or more exact-text replacements to LF-normalized content.
 * Throws on: empty oldText, not found, non-unique match, overlap, or no-op.
 */
function applyEditsToNormalizedContent(
  normalizedContent: string,
  edits: Edit[],
): { baseContent: string; newContent: string } {
  const normalizedEdits = edits.map((edit) => ({
    newText: normalizeToLF(edit.newText),
    oldText: normalizeToLF(
      stripCopiedLinePrefixes(edit.oldText) ?? edit.oldText,
    ),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i]!.oldText.length === 0) {
      throw getEmptyOldTextError(i, normalizedEdits.length)
    }
  }

  const initialMatches = normalizedEdits.map((edit) =>
    findBestMatchMode(normalizedContent, edit.oldText),
  )
  const matchMode = chooseMatchMode(initialMatches)
  const replacementBaseContent = normalizeForMatchMode(
    normalizedContent,
    matchMode,
  )

  const matchedEdits: MatchedEdit[] = []
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]!
    const oldTextForMode = normalizeTextForMatchMode(edit.oldText, matchMode)
    if (oldTextForMode.length === 0) {
      throw getEmptyOldTextError(i, normalizedEdits.length)
    }
    const matchIndex = replacementBaseContent.indexOf(oldTextForMode)
    if (matchIndex === -1) {
      throw getNotFoundError(i, normalizedEdits.length)
    }

    const occurrences = countOccurrences(replacementBaseContent, oldTextForMode)
    if (occurrences > 1) {
      throw getDuplicateError(i, normalizedEdits.length, occurrences)
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex,
      matchLength: oldTextForMode.length,
      newText:
        matchMode === 'indent'
          ? reindentReplacementForIndentMatch(
              edit.newText,
              normalizedContent,
              replacementBaseContent,
              matchIndex,
            )
          : edit.newText,
    })
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex)
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1]!
    const current = matchedEdits[i]!
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap. Merge them into one edit or target disjoint regions.`,
      )
    }
  }

  const baseContent = normalizedContent
  const newContent =
    matchMode === 'exact'
      ? applyReplacements(replacementBaseContent, matchedEdits)
      : applyReplacementsPreservingUnchangedLines(
          normalizedContent,
          replacementBaseContent,
          matchedEdits,
        )

  if (baseContent === newContent) {
    throw getNoChangeError(normalizedEdits.length)
  }

  return { baseContent, newContent }
}

function applyReplacements(
  content: string,
  replacements: TextReplacement[],
  offset = 0,
): string {
  let result = content
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i]!
    const matchIndex = replacement.matchIndex - offset
    result =
      result.substring(0, matchIndex) +
      replacement.newText +
      result.substring(matchIndex + replacement.matchLength)
  }
  return result
}

/**
 * Overlay fuzzy-matched edits onto the original content, copying unchanged
 * line blocks back from the original (preserves their exact bytes).
 */
function applyReplacementsPreservingUnchangedLines(
  originalContent: string,
  baseContent: string,
  replacements: TextReplacement[],
): string {
  const originalLines = splitLinesWithEndings(originalContent)
  const baseLines = getLineSpans(baseContent)
  if (originalLines.length !== baseLines.length) {
    throw new Error(
      'Cannot preserve unchanged lines because the base content has a different line count.',
    )
  }

  const groups: Array<{
    endLine: number
    replacements: TextReplacement[]
    startLine: number
  }> = []
  const sortedReplacements = [...replacements].sort(
    (a, b) => a.matchIndex - b.matchIndex,
  )
  for (const replacement of sortedReplacements) {
    const range = getReplacementLineRange(baseLines, replacement)
    const current = groups[groups.length - 1]
    if (current && range.startLine < current.endLine) {
      current.endLine = Math.max(current.endLine, range.endLine)
      current.replacements.push(replacement)
      continue
    }
    groups.push({ ...range, replacements: [replacement] })
  }

  let originalLineIndex = 0
  let result = ''
  for (const group of groups) {
    result += originalLines.slice(originalLineIndex, group.startLine).join('')

    const groupStartOffset = baseLines[group.startLine]!.start
    const groupEndOffset = baseLines[group.endLine - 1]!.end
    result += applyReplacements(
      baseContent.slice(groupStartOffset, groupEndOffset),
      group.replacements,
      groupStartOffset,
    )
    originalLineIndex = group.endLine
  }
  result += originalLines.slice(originalLineIndex).join('')

  return result
}

function buildLineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = splitContentLines(oldContent)
  const newLines = splitContentLines(newContent)
  const columns = newLines.length + 1
  const matrixCells = (oldLines.length + 1) * columns
  if (matrixCells > 4_000_000) {
    return buildSimpleLineDiff(oldLines, newLines)
  }

  const lcs = new Uint32Array(matrixCells)
  for (let i = oldLines.length - 1; i >= 0; i--) {
    const row = i * columns
    const nextRow = (i + 1) * columns
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[row + j] =
        oldLines[i] === newLines[j]
          ? lcs[nextRow + j + 1]! + 1
          : Math.max(lcs[nextRow + j]!, lcs[row + j + 1]!)
    }
  }

  const diff: DiffLine[] = []
  let i = 0
  let j = 0
  let oldLine = 1
  let newLine = 1
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'context' })
      i++
      j++
      oldLine++
      newLine++
    } else if (lcs[(i + 1) * columns + j]! >= lcs[i * columns + j + 1]!) {
      diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'remove' })
      i++
      oldLine++
    } else {
      diff.push({ newLine, oldLine, text: newLines[j]!, type: 'add' })
      j++
      newLine++
    }
  }

  while (i < oldLines.length) {
    diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'remove' })
    i++
    oldLine++
  }
  while (j < newLines.length) {
    diff.push({ newLine, oldLine, text: newLines[j]!, type: 'add' })
    j++
    newLine++
  }

  return diff
}

function buildSimpleLineDiff(
  oldLines: string[],
  newLines: string[],
): DiffLine[] {
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] ===
      newLines[newLines.length - suffix - 1]
  ) {
    suffix++
  }

  const diff: DiffLine[] = []
  let oldLine = 1
  let newLine = 1
  for (let i = 0; i < prefix; i++) {
    diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'context' })
    oldLine++
    newLine++
  }
  for (let i = prefix; i < oldLines.length - suffix; i++) {
    diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'remove' })
    oldLine++
  }
  for (let i = prefix; i < newLines.length - suffix; i++) {
    diff.push({ newLine, oldLine, text: newLines[i]!, type: 'add' })
    newLine++
  }
  for (let i = oldLines.length - suffix; i < oldLines.length; i++) {
    diff.push({ newLine, oldLine, text: oldLines[i]!, type: 'context' })
    oldLine++
    newLine++
  }
  return diff
}

function chooseMatchMode(matches: MatchModeResult[]): MatchMode {
  const firstMiss = matches.find((match) => !match.found)
  if (firstMiss) return firstMiss.mode
  if (matches.some((match) => match.mode === 'indent')) return 'indent'
  if (matches.some((match) => match.mode === 'fuzzy')) return 'fuzzy'
  return 'exact'
}

function commonLeadingIndent(lines: string[]): string {
  if (!lines.length) return ''
  let common = /^[\t ]*/.exec(lines[0]!)?.[0] ?? ''
  for (const line of lines.slice(1)) {
    const indent = /^[\t ]*/.exec(line)?.[0] ?? ''
    while (common && !indent.startsWith(common)) {
      common = common.slice(0, -1)
    }
  }
  return common
}

function countOccurrences(content: string, oldText: string): number {
  return content.split(oldText).length - 1
}

function createDiffHunks(
  lines: DiffLine[],
  contextLines: number,
): Array<{ end: number; start: number }> {
  const changedIndexes = lines
    .map((line, index) => (line.type === 'context' ? -1 : index))
    .filter((index) => index >= 0)
  const hunks: Array<{ end: number; start: number }> = []
  for (const index of changedIndexes) {
    const start = Math.max(0, index - contextLines)
    const end = Math.min(lines.length, index + contextLines + 1)
    const current = hunks[hunks.length - 1]
    if (current && start <= current.end) {
      current.end = Math.max(current.end, end)
    } else {
      hunks.push({ end, start })
    }
  }
  return hunks
}

function findBestMatchMode(content: string, oldText: string): MatchModeResult {
  if (content.includes(oldText)) return { found: true, mode: 'exact' }

  const fuzzyContent = normalizeForFuzzyMatch(content)
  const fuzzyOldText = normalizeForFuzzyMatch(oldText)
  if (fuzzyContent.includes(fuzzyOldText)) {
    return { found: true, mode: 'fuzzy' }
  }

  const indentContent = normalizeForIndentInsensitiveMatch(content)
  const indentOldText = normalizeForIndentInsensitiveMatch(oldText)
  return { found: indentContent.includes(indentOldText), mode: 'indent' }
}

function findLineIndex(lines: LineSpan[], offset: number): number {
  return lines.findIndex((line) => offset >= line.start && offset < line.end)
}

function firstLineNumber(
  lines: DiffLine[],
  key: 'newLine' | 'oldLine',
): number | undefined {
  return lines.find((line) => typeof line[key] === 'number')?.[key]
}

function formatPatchRange(start: number, count: number): string {
  if (count === 0) return `${Math.max(0, start - 1)},0`
  return count === 1 ? String(start) : `${start},${count}`
}

function getDuplicateError(
  editIndex: number,
  totalEdits: number,
  occurrences: number,
): Error {
  return totalEdits === 1
    ? new Error(
        `Found ${occurrences} occurrences of the text. The text must be unique. Provide more context to make it unique.`,
      )
    : new Error(
        `Found ${occurrences} occurrences of edits[${editIndex}]. Each oldText must be unique. Provide more context.`,
      )
}

function getEmptyOldTextError(editIndex: number, totalEdits: number): Error {
  return totalEdits === 1
    ? new Error('oldText must not be empty.')
    : new Error(`edits[${editIndex}].oldText must not be empty.`)
}

function getLineNumberWidth(oldContent: string, newContent: string): number {
  return String(
    Math.max(
      splitContentLines(oldContent).length,
      splitContentLines(newContent).length,
    ),
  ).length
}

function getLineSpans(content: string): LineSpan[] {
  let offset = 0
  return splitLinesWithEndings(content).map((line) => {
    const span = { end: offset + line.length, start: offset }
    offset = span.end
    return span
  })
}

function getNoChangeError(totalEdits: number): Error {
  return totalEdits === 1
    ? new Error('No changes made. The replacement produced identical content.')
    : new Error('No changes made. The replacements produced identical content.')
}

function getNotFoundError(editIndex: number, totalEdits: number): Error {
  const retryGuidance =
    'Read or grep the current /index.html before retrying; do not guess whitespace or reuse stale snippets.'
  return totalEdits === 1
    ? new Error(
        `Could not find the exact text. The old text must match exactly including all whitespace and newlines. ${retryGuidance}`,
      )
    : new Error(
        `Could not find edits[${editIndex}]. The oldText must match exactly including all whitespace and newlines. ${retryGuidance}`,
      )
}

function getReplacementLineRange(
  lines: LineSpan[],
  replacement: TextReplacement,
) {
  const replacementStart = replacement.matchIndex
  const replacementEnd = replacement.matchIndex + replacement.matchLength

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (replacementStart >= line.start && replacementStart < line.end) {
      startLine = i
      break
    }
  }
  if (startLine === -1) {
    throw new Error('Replacement range is outside the base content.')
  }

  let endLine = startLine
  while (endLine < lines.length && lines[endLine]!.end < replacementEnd) {
    endLine++
  }
  if (endLine >= lines.length) {
    throw new Error('Replacement range is outside the base content.')
  }

  return { endLine: endLine + 1, startLine }
}

function normalizeForIndentInsensitiveMatch(text: string): string {
  return normalizeForFuzzyMatch(text)
    .split('\n')
    .map((line) => line.replace(/^[\t ]+/, ''))
    .join('\n')
}

function normalizeForMatchMode(text: string, mode: MatchMode): string {
  if (mode === 'indent') return normalizeForIndentInsensitiveMatch(text)
  if (mode === 'fuzzy') return normalizeForFuzzyMatch(text)
  return text
}

function normalizeTextForMatchMode(text: string, mode: MatchMode): string {
  return normalizeForMatchMode(text, mode)
}

function reindentBlock(text: string, baseIndent: string): string {
  if (!baseIndent && !text.match(/^\s/m)) return text

  const lines = text.split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
  const commonIndent = commonLeadingIndent(nonEmptyLines)
  return lines
    .map((line) => {
      if (line.trim().length === 0) return line
      const withoutCommon =
        commonIndent && line.startsWith(commonIndent)
          ? line.slice(commonIndent.length)
          : line
      return baseIndent + withoutCommon
    })
    .join('\n')
}

function reindentReplacementForIndentMatch(
  newText: string,
  originalContent: string,
  baseContent: string,
  matchIndex: number,
): string {
  const baseLines = getLineSpans(baseContent)
  const lineIndex = findLineIndex(baseLines, matchIndex)
  if (lineIndex === -1) return newText

  const lineStart = baseLines[lineIndex]!.start
  const beforeMatch = baseContent.slice(lineStart, matchIndex)
  if (beforeMatch.trim().length > 0) return newText

  const originalLine = splitLinesWithEndings(originalContent)[lineIndex] ?? ''
  const baseIndent = /^[\t ]*/.exec(originalLine)?.[0] ?? ''
  return reindentBlock(newText, baseIndent)
}

function splitContentLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function splitLinesWithEndings(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? []
}

function stripCopiedLinePrefixes(text: string): null | string {
  const normalized = normalizeToLF(text)
  const lines = normalized.split('\n')
  let stripped = 0
  const cleaned = lines.map((line) => {
    if (line.trim().length === 0) return line
    const readMatch = /^\s*\d+\s{2}(.*)$/.exec(line)
    if (readMatch) {
      stripped += 1
      return readMatch[1]!
    }
    const grepMatch = /^\s*\d+[:-]\s(.*)$/.exec(line)
    if (grepMatch) {
      stripped += 1
      return grepMatch[1]!
    }
    return line
  })
  const nonEmpty = lines.filter((line) => line.trim().length > 0).length
  return nonEmpty > 0 && stripped === nonEmpty ? cleaned.join('\n') : null
}
