/**
 * Fuzzy text matching + safe edit application, ported from pi's edit-diff.ts.
 * Operates purely on strings — no filesystem. Same semantics: exact match
 * first, then a normalized fuzzy pass; edits must be unique and non-overlapping;
 * a no-op replacement is an error.
 */

export interface AppliedEditsResult {
  baseContent: string
  newContent: string
}

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

interface TextReplacement {
  matchIndex: number
  matchLength: number
  newText: string
}

/**
 * Apply a single edit to the raw store string. Handles BOM stripping + line
 * ending normalization while preserving the file's original BOM/line endings.
 */
export function applyEdit(
  currentHtml: string,
  oldText: string,
  newText: string,
): string {
  return applyEdits(currentHtml, [{ newText, oldText }])
}

/**
 * Apply one or more edits to the raw store string. All oldText matches are
 * resolved against the original file content (not incrementally), matching Pi's
 * edit tool semantics.
 */
export function applyEdits(currentHtml: string, edits: Edit[]): string {
  const { bom, text } = stripBom(currentHtml)
  const originalEnding = detectLineEnding(text)
  const normalizedContent = normalizeToLF(text)
  const { newContent } = applyEditsToNormalizedContent(normalizedContent, edits)
  return bom + restoreLineEndings(newContent, originalEnding)
}

/**
 * Apply one or more exact-text replacements to LF-normalized content.
 * Throws on: empty oldText, not found, non-unique match, overlap, or no-op.
 */
export function applyEditsToNormalizedContent(
  normalizedContent: string,
  edits: Edit[],
): AppliedEditsResult {
  const normalizedEdits = edits.map((edit) => ({
    newText: normalizeToLF(edit.newText),
    oldText: normalizeToLF(edit.oldText),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i]!.oldText.length === 0) {
      throw getEmptyOldTextError(i, normalizedEdits.length)
    }
  }

  const initialMatches = normalizedEdits.map((edit) =>
    fuzzyFindText(normalizedContent, edit.oldText),
  )
  const usedFuzzyMatch = initialMatches.some((match) => match.usedFuzzyMatch)
  const replacementBaseContent = usedFuzzyMatch
    ? normalizeForFuzzyMatch(normalizedContent)
    : normalizedContent

  const matchedEdits: MatchedEdit[] = []
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]!
    const matchResult = fuzzyFindText(replacementBaseContent, edit.oldText)
    if (!matchResult.found) {
      throw getNotFoundError(i, normalizedEdits.length)
    }

    const occurrences = countOccurrences(replacementBaseContent, edit.oldText)
    if (occurrences > 1) {
      throw getDuplicateError(i, normalizedEdits.length, occurrences)
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      newText: edit.newText,
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
  const newContent = usedFuzzyMatch
    ? applyReplacementsPreservingUnchangedLines(
        normalizedContent,
        replacementBaseContent,
        matchedEdits,
      )
    : applyReplacements(replacementBaseContent, matchedEdits)

  if (baseContent === newContent) {
    throw getNoChangeError(normalizedEdits.length)
  }

  return { baseContent, newContent }
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

function countOccurrences(content: string, oldText: string): number {
  const fuzzyContent = normalizeForFuzzyMatch(content)
  const fuzzyOldText = normalizeForFuzzyMatch(oldText)
  return fuzzyContent.split(fuzzyOldText).length - 1
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
  return totalEdits === 1
    ? new Error(
        'Could not find the exact text. The old text must match exactly including all whitespace and newlines.',
      )
    : new Error(
        `Could not find edits[${editIndex}]. The oldText must match exactly including all whitespace and newlines.`,
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

function splitLinesWithEndings(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? []
}
