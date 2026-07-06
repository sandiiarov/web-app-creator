import { createHash } from 'node:crypto'

import { countChangedLines } from './edit-diff.ts'

export type AnchorRange =
  | []
  | [startAnchor: string, endAnchor: string]
  | [startAnchor: string]

export interface ApplyAnchorEdit {
  intent: string
  operation: HtmlAnchorEditOperation
  range: AnchorRange
  text?: string
}

export interface ApplyAnchorEditsResult {
  bytes: number
  changedLines: number
  changedText: string
  checksum: `sha256:${string}`
  document: HtmlDocumentJsonV1
  edits: PerEditResult[]
  firstChangedAnchor?: string
  firstChangedLine: number
  html: string
  lastChangedAnchor?: string
  operations: number
}

export interface FindHtmlDocumentOptions {
  context?: number
  ignoreCase?: boolean
  limit?: number
  maxLineLength?: number
  regex?: boolean
  text: string
}

export interface FindHtmlDocumentResult {
  checksum: `sha256:${string}`
  error?: string
  matchCount: number
  matchLimitReached: boolean
  returnedLines: number
  text: string
  totalLines: number
  truncatedLines: boolean
}

export type HtmlAnchorEditOperation =
  | 'delete'
  | 'insert_after'
  | 'insert_before'
  | 'replace'

export interface HtmlDocumentJsonV1 {
  checksum: `sha256:${string}`
  finalNewline: boolean
  lineEnding: '\n' | '\r\n'
  lines: HtmlLine[]
  nextAnchor: number
  version: 1
}

export type HtmlLine = [anchor: string, text: string]

export interface PerEditResult {
  changedLines: number
  changedText: string
  firstChangedAnchor?: string
  intent: string
  lastChangedAnchor?: string
}

export interface ReadHtmlDocumentOptions {
  limit?: number
  maxLineLength?: number
  offset?: number
  range?: AnchorRange
}

export interface ReadHtmlDocumentResult {
  checksum: `sha256:${string}`
  endAnchor?: string
  lines: number
  startAnchor?: string
  text: string
  totalLines: number
  truncatedLines: boolean
}

interface CompiledEdit {
  editIndex: number
  endExclusive: number
  insertPosition: number
  kind: 'insert' | 'mutate'
  lines: string[]
  operation: HtmlAnchorEditOperation
  rangeIsWholeDocument?: boolean
  sourceText?: string
  startIndex: number
}

const DEFAULT_LIMIT = 2000
const DEFAULT_MAX_LINE_LENGTH = 500

export function applyAnchorEdits(
  document: HtmlDocumentJsonV1,
  edits: ApplyAnchorEdit[],
): ApplyAnchorEditsResult {
  if (edits.length === 0) {
    throw new Error('edits must contain at least one edit.')
  }

  const baseDocument = cloneHtmlDocument(normalizeHtmlDocument(document))
  const baseHtml = renderHtmlDocument(baseDocument)
  const compiledEdits = compileAnchorEdits(baseDocument, edits)
  const { document: nextDocument, placements } = applyCompiledEdits(
    baseDocument,
    compiledEdits,
  )
  const html = renderHtmlDocument(nextDocument)

  if (html === baseHtml) {
    throw new Error('No changes made. The edits produced identical HTML.')
  }

  const changedRegion = getChangedRegion(
    baseDocument,
    nextDocument,
    compiledEdits,
  )
  const perEditResults = getPerEditResults(
    nextDocument,
    compiledEdits,
    edits,
    placements,
  )

  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    changedLines: countChangedLines(baseHtml, html),
    changedText: changedRegion.text,
    checksum: nextDocument.checksum,
    document: nextDocument,
    edits: perEditResults,
    firstChangedAnchor: changedRegion.firstChangedAnchor,
    firstChangedLine: changedRegion.firstChangedLine,
    html,
    lastChangedAnchor: changedRegion.lastChangedAnchor,
    operations: edits.length,
  }
}

export function cloneHtmlDocument(
  document: HtmlDocumentJsonV1,
): HtmlDocumentJsonV1 {
  return {
    ...document,
    lines: document.lines.map(([anchor, text]) => [anchor, text]),
  }
}

export function createHtmlDocumentFromString(html: string): HtmlDocumentJsonV1 {
  const lineEnding = detectLineEnding(html)
  const { finalNewline, lines } = splitHtmlIntoDocumentLines(html)
  let nextAnchor = 1
  const anchoredLines = lines.map(
    (line): HtmlLine => [createAnchor(nextAnchor++), line],
  )

  return normalizeHtmlDocument({
    checksum: 'sha256:',
    finalNewline,
    lineEnding,
    lines: anchoredLines,
    nextAnchor,
    version: 1,
  })
}

export function findHtmlDocumentLines(
  document: HtmlDocumentJsonV1,
  options: FindHtmlDocumentOptions,
): FindHtmlDocumentResult {
  const normalizedDocument = normalizeHtmlDocument(document)
  const context = Math.max(0, options.context ?? 0)
  const limit = Math.max(1, options.limit ?? 100)
  const maxLineLength = Math.max(
    1,
    options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH,
  )
  const matcher = createLineMatcher(options)

  if (typeof matcher === 'string') {
    return {
      checksum: normalizedDocument.checksum,
      error: matcher,
      matchCount: 0,
      matchLimitReached: false,
      returnedLines: 0,
      text: '',
      totalLines: normalizedDocument.lines.length,
      truncatedLines: false,
    }
  }

  const matchIndexes: number[] = []
  let matchLimitReached = false
  for (let index = 0; index < normalizedDocument.lines.length; index++) {
    if (!matcher(normalizedDocument.lines[index]![1])) continue
    matchIndexes.push(index)
    if (matchIndexes.length >= limit) {
      matchLimitReached = true
      break
    }
  }

  const includedIndexes = new Set<number>()
  for (const matchIndex of matchIndexes) {
    const start = Math.max(0, matchIndex - context)
    const end = Math.min(
      normalizedDocument.lines.length - 1,
      matchIndex + context,
    )
    for (let index = start; index <= end; index++) {
      includedIndexes.add(index)
    }
  }

  const lines = [...includedIndexes]
    .sort((a, b) => a - b)
    .map((index) => normalizedDocument.lines[index]!)
  const formatted = formatCompactLines(lines, maxLineLength)

  return {
    checksum: normalizedDocument.checksum,
    matchCount: matchIndexes.length,
    matchLimitReached,
    returnedLines: lines.length,
    text: formatted.text,
    totalLines: normalizedDocument.lines.length,
    truncatedLines: formatted.truncatedLines,
  }
}

export function normalizeHtmlDocument(
  document: HtmlDocumentJsonV1,
): HtmlDocumentJsonV1 {
  validateHtmlDocumentShape(document)
  const normalized: HtmlDocumentJsonV1 = {
    checksum: 'sha256:',
    finalNewline: document.finalNewline,
    lineEnding: document.lineEnding,
    lines: document.lines.map(([anchor, text]) => [anchor, text]),
    nextAnchor: document.nextAnchor,
    version: 1,
  }
  normalized.checksum = checksumHtml(renderHtmlDocument(normalized))

  if (
    document.checksum &&
    document.checksum !== 'sha256:' &&
    document.checksum !== normalized.checksum
  ) {
    throw new Error('html.json checksum does not match its rendered HTML.')
  }

  return normalized
}

export function parseHtmlDocumentJson(value: unknown): HtmlDocumentJsonV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('html.json must be an object.')
  }
  return normalizeHtmlDocument(value as HtmlDocumentJsonV1)
}

export function readHtmlDocumentLines(
  document: HtmlDocumentJsonV1,
  options: ReadHtmlDocumentOptions = {},
): ReadHtmlDocumentResult {
  const normalizedDocument = normalizeHtmlDocument(document)
  if (options.range && options.offset !== undefined) {
    throw new Error('read range and offset are mutually exclusive.')
  }

  const maxLineLength = Math.max(
    1,
    options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH,
  )
  const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT)
  const { endExclusive, startIndex } = options.range
    ? resolveSliceRange(normalizedDocument, options.range)
    : resolveOffsetRange(normalizedDocument, options.offset)
  const selected = normalizedDocument.lines.slice(
    startIndex,
    Math.min(endExclusive, startIndex + limit),
  )
  const formatted = formatCompactLines(selected, maxLineLength)

  return {
    checksum: normalizedDocument.checksum,
    endAnchor: selected[selected.length - 1]?.[0],
    lines: selected.length,
    startAnchor: selected[0]?.[0],
    text: formatted.text,
    totalLines: normalizedDocument.lines.length,
    truncatedLines: formatted.truncatedLines,
  }
}

export function renderHtmlDocument(document: HtmlDocumentJsonV1): string {
  const body = document.lines.map(([, text]) => text).join(document.lineEnding)
  return document.finalNewline ? `${body}${document.lineEnding}` : body
}

function applyCompiledEdits(
  document: HtmlDocumentJsonV1,
  compiledEdits: CompiledEdit[],
): { document: HtmlDocumentJsonV1; placements: Map<number, { count: number; startNewIndex: number }> } {
  let nextAnchor = document.nextAnchor
  const mutationsByStart = new Map<number, CompiledEdit>()
  const insertionsByPosition = new Map<number, CompiledEdit[]>()
  const lines: HtmlLine[] = []
  const placements = new Map<number, { count: number; startNewIndex: number }>()

  for (const edit of compiledEdits) {
    if (edit.kind === 'insert') {
      const insertions = insertionsByPosition.get(edit.insertPosition) ?? []
      insertions.push(edit)
      insertionsByPosition.set(edit.insertPosition, insertions)
    } else {
      mutationsByStart.set(edit.startIndex, edit)
    }
  }

  function recordPlacement(edit: CompiledEdit, count: number) {
    if (count <= 0) return
    placements.set(edit.editIndex, {
      count,
      startNewIndex: lines.length,
    })
  }

  function appendInsertion(position: number) {
    const insertions = insertionsByPosition.get(position) ?? []
    for (const insertion of insertions) {
      recordPlacement(insertion, insertion.lines.length)
      lines.push(...createAnchoredLines(insertion.lines, nextAnchor))
      nextAnchor += insertion.lines.length
    }
  }

  let index = 0
  while (index < document.lines.length) {
    appendInsertion(index)
    const mutation = mutationsByStart.get(index)
    if (mutation) {
      if (mutation.operation === 'replace') {
        recordPlacement(mutation, mutation.lines.length)
        lines.push(...createAnchoredLines(mutation.lines, nextAnchor))
        nextAnchor += mutation.lines.length
      }
      index = mutation.endExclusive
      continue
    }

    lines.push(document.lines[index]!)
    index += 1
  }
  appendInsertion(document.lines.length)

  const wholeDocumentReplacement = compiledEdits.find(
    (edit) =>
      edit.operation === 'replace' &&
      edit.rangeIsWholeDocument &&
      edit.kind === 'mutate',
  )
  const nextDocument: HtmlDocumentJsonV1 = {
    checksum: 'sha256:',
    finalNewline: wholeDocumentReplacement
      ? editTextHasFinalNewline(wholeDocumentReplacement)
      : document.finalNewline,
    lineEnding: document.lineEnding,
    lines,
    nextAnchor,
    version: 1,
  }
  nextDocument.checksum = checksumHtml(renderHtmlDocument(nextDocument))
  return { document: nextDocument, placements }
}

function assertNoConflicts(compiledEdits: CompiledEdit[]) {
  const mutations = compiledEdits
    .filter((edit) => edit.kind === 'mutate')
    .sort((a, b) => a.startIndex - b.startIndex)

  for (let index = 1; index < mutations.length; index++) {
    const previous = mutations[index - 1]!
    const current = mutations[index]!
    if (current.startIndex < previous.endExclusive) {
      throw new Error('Edit ranges must not overlap.')
    }
  }

  for (const insertion of compiledEdits.filter(
    (edit) => edit.kind === 'insert',
  )) {
    const conflict = mutations.find(
      (mutation) =>
        insertion.insertPosition > mutation.startIndex &&
        insertion.insertPosition < mutation.endExclusive,
    )
    if (conflict) {
      throw new Error(
        'Insertions cannot target the inside of a replaced or deleted range.',
      )
    }
  }
}

function checksumHtml(html: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(html).digest('hex')}`
}

function compileAnchorEdit(
  document: HtmlDocumentJsonV1,
  edit: ApplyAnchorEdit,
  editIndex: number,
): CompiledEdit {
  if (!isKnownOperation(edit.operation)) {
    throw new Error(`edits[${editIndex}].operation is not supported.`)
  }
  if (!Array.isArray(edit.range) || edit.range.length > 2) {
    throw new Error(
      `edits[${editIndex}].range must be [], [anchor], or [startAnchor, endAnchor].`,
    )
  }
  if (edit.operation === 'delete') {
    if (edit.range.length === 0) {
      throw new Error(`edits[${editIndex}].range cannot be [] for delete.`)
    }
    return {
      ...resolveMutationRange(document, edit.range, editIndex),
      editIndex,
      insertPosition: -1,
      kind: 'mutate',
      lines: [],
      operation: edit.operation,
    }
  }

  if (typeof edit.text !== 'string') {
    throw new Error(
      `edits[${editIndex}].text is required for ${edit.operation}.`,
    )
  }

  const lines = splitEditText(edit.text)
  if (edit.operation === 'replace') {
    const range =
      edit.range.length === 0
        ? { endExclusive: document.lines.length, startIndex: 0 }
        : resolveMutationRange(document, edit.range, editIndex)
    return {
      ...range,
      editIndex,
      insertPosition: -1,
      kind: 'mutate',
      lines,
      operation: edit.operation,
      rangeIsWholeDocument: edit.range.length === 0,
      sourceText: edit.text,
    }
  }

  const position = resolveInsertionPosition(
    document,
    edit.range,
    edit.operation,
    editIndex,
  )
  return {
    editIndex,
    endExclusive: position,
    insertPosition: position,
    kind: 'insert',
    lines,
    operation: edit.operation,
    startIndex: position,
  }
}

function compileAnchorEdits(
  document: HtmlDocumentJsonV1,
  edits: ApplyAnchorEdit[],
): CompiledEdit[] {
  const compiledEdits = edits.map((edit, editIndex) =>
    compileAnchorEdit(document, edit, editIndex),
  )
  assertNoConflicts(compiledEdits)
  return compiledEdits
}

function createAnchor(nextAnchor: number): string {
  return `a${nextAnchor.toString(36)}`
}

function createAnchoredLines(lines: string[], startAnchor: number): HtmlLine[] {
  return lines.map((line, index) => [createAnchor(startAnchor + index), line])
}

function createLineMatcher(
  options: FindHtmlDocumentOptions,
): ((line: string) => boolean) | string {
  if (options.regex) {
    try {
      const regex = new RegExp(options.text, options.ignoreCase ? 'i' : '')
      return (line) => regex.test(line)
    } catch (error) {
      return `Invalid regex: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  const needle = options.ignoreCase ? options.text.toLowerCase() : options.text
  return (line) => {
    const haystack = options.ignoreCase ? line.toLowerCase() : line
    return haystack.includes(needle)
  }
}

function detectLineEnding(html: string): '\n' | '\r\n' {
  return html.includes('\r\n') ? '\r\n' : '\n'
}

function editTextHasFinalNewline(edit: { sourceText?: string }): boolean {
  return (
    typeof edit.sourceText === 'string' &&
    normalizeLineEndings(edit.sourceText).endsWith('\n')
  )
}

function formatCompactLines(
  lines: HtmlLine[],
  maxLineLength = DEFAULT_MAX_LINE_LENGTH,
): { text: string; truncatedLines: boolean } {
  let truncatedLines = false
  const text = lines
    .map(([anchor, line]) => {
      const truncated = truncateLine(line, maxLineLength)
      if (truncated.truncated) truncatedLines = true
      return `${anchor}|${truncated.text}`
    })
    .join('\n')

  return { text, truncatedLines }
}

function getChangedIndexes(
  baseDocument: HtmlDocumentJsonV1,
  document: HtmlDocumentJsonV1,
  edits: CompiledEdit[],
): number[] {
  const changedIndexes: number[] = []
  const mutationsByStart = new Map<number, CompiledEdit>()
  const insertionsByPosition = new Map<number, CompiledEdit[]>()

  for (const edit of edits) {
    if (edit.kind === 'insert') {
      const insertions = insertionsByPosition.get(edit.insertPosition) ?? []
      insertions.push(edit)
      insertionsByPosition.set(edit.insertPosition, insertions)
    } else {
      mutationsByStart.set(edit.startIndex, edit)
    }
  }

  function markInsertion(position: number, nextIndex: number): number {
    let index = nextIndex
    for (const insertion of insertionsByPosition.get(position) ?? []) {
      for (let offset = 0; offset < insertion.lines.length; offset++) {
        changedIndexes.push(index + offset)
      }
      index += insertion.lines.length
    }
    return index
  }

  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < baseDocument.lines.length) {
    newIndex = markInsertion(oldIndex, newIndex)
    const mutation = mutationsByStart.get(oldIndex)
    if (mutation) {
      if (mutation.operation === 'replace') {
        for (let offset = 0; offset < mutation.lines.length; offset++) {
          changedIndexes.push(newIndex + offset)
        }
        newIndex += mutation.lines.length
      } else if (document.lines.length > 0) {
        changedIndexes.push(Math.min(newIndex, document.lines.length - 1))
      }
      oldIndex = mutation.endExclusive
      continue
    }

    oldIndex += 1
    newIndex += 1
  }
  markInsertion(baseDocument.lines.length, newIndex)

  return [...new Set(changedIndexes)]
    .filter((index) => index >= 0 && index < document.lines.length)
    .sort((a, b) => a - b)
}

function getChangedRegion(
  baseDocument: HtmlDocumentJsonV1,
  document: HtmlDocumentJsonV1,
  edits: CompiledEdit[],
): {
  firstChangedAnchor?: string
  firstChangedLine: number
  lastChangedAnchor?: string
  text: string
} {
  const changedIndexes = getChangedIndexes(baseDocument, document, edits)
  const firstIndex = changedIndexes[0] ?? 0
  const lastIndex = changedIndexes[changedIndexes.length - 1] ?? firstIndex
  const startIndex = Math.max(0, firstIndex - 2)
  const endIndex = Math.min(document.lines.length, firstIndex + 8)
  const lines = document.lines.slice(startIndex, endIndex)
  const formatted = formatCompactLines(lines)

  return {
    firstChangedAnchor: document.lines[firstIndex]?.[0],
    firstChangedLine: document.lines.length === 0 ? 1 : firstIndex + 1,
    lastChangedAnchor: document.lines[lastIndex]?.[0],
    text: formatted.text,
  }
}

/**
 * Build a per-edit result slice from the placements recorded by
 * `applyCompiledEdits`: each edit's contributed lines (with their fresh
 * anchors) and line count. Deletes contribute zero lines and thus have an
 * empty `changedText`; their `intent` still flows through to the UI.
 */
function getPerEditResults(
  document: HtmlDocumentJsonV1,
  compiledEdits: CompiledEdit[],
  edits: ApplyAnchorEdit[],
  placements: Map<number, { count: number; startNewIndex: number }>,
): PerEditResult[] {
  return compiledEdits.map((compiled) => {
    const placement = placements.get(compiled.editIndex)
    const count = placement?.count ?? 0
    const start = placement?.startNewIndex ?? 0
    const slice = document.lines.slice(start, start + count)
    const formatted = formatCompactLines(slice)
    return {
      changedLines: count,
      changedText: formatted.text,
      firstChangedAnchor: slice[0]?.[0],
      intent: edits[compiled.editIndex]!.intent,
      lastChangedAnchor: slice[slice.length - 1]?.[0],
    }
  })
}

function isKnownOperation(
  operation: string,
): operation is HtmlAnchorEditOperation {
  return (
    operation === 'delete' ||
    operation === 'insert_after' ||
    operation === 'insert_before' ||
    operation === 'replace'
  )
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function resolveAnchorIndex(
  document: HtmlDocumentJsonV1,
  anchor: string,
  editIndex?: number,
): number {
  const index = document.lines.findIndex(
    ([lineAnchor]) => lineAnchor === anchor,
  )
  if (index === -1) {
    const prefix =
      editIndex === undefined ? 'range' : `edits[${editIndex}].range`
    throw new Error(`${prefix} references missing anchor ${anchor}.`)
  }
  return index
}

function resolveInsertionPosition(
  document: HtmlDocumentJsonV1,
  range: AnchorRange,
  operation: 'insert_after' | 'insert_before',
  editIndex: number,
): number {
  if (range.length === 0) {
    return operation === 'insert_before' ? 0 : document.lines.length
  }

  const resolved = resolveMutationRange(document, range, editIndex)
  return operation === 'insert_before'
    ? resolved.startIndex
    : resolved.endExclusive
}

function resolveMutationRange(
  document: HtmlDocumentJsonV1,
  range: AnchorRange,
  editIndex: number,
): { endExclusive: number; startIndex: number } {
  if (range.length === 0) {
    throw new Error(
      `edits[${editIndex}].range cannot be [] for this operation.`,
    )
  }
  const startIndex = resolveAnchorIndex(document, range[0], editIndex)
  const endIndex =
    range.length === 1
      ? startIndex
      : resolveAnchorIndex(document, range[1], editIndex)
  if (endIndex < startIndex) {
    throw new Error(
      `edits[${editIndex}].range end anchor must not come before start anchor.`,
    )
  }
  return { endExclusive: endIndex + 1, startIndex }
}

function resolveOffsetRange(
  document: HtmlDocumentJsonV1,
  offset = 1,
): { endExclusive: number; startIndex: number } {
  if (!Number.isInteger(offset) || offset < 1) {
    throw new Error('read offset must be a positive integer.')
  }
  return {
    endExclusive: document.lines.length,
    startIndex: Math.min(offset - 1, document.lines.length),
  }
}

function resolveSliceRange(
  document: HtmlDocumentJsonV1,
  range: AnchorRange,
): { endExclusive: number; startIndex: number } {
  if (range.length === 0) {
    return { endExclusive: document.lines.length, startIndex: 0 }
  }
  const startIndex = resolveAnchorIndex(document, range[0])
  const endIndex =
    range.length === 1 ? startIndex : resolveAnchorIndex(document, range[1])
  if (endIndex < startIndex) {
    throw new Error('range end anchor must not come before start anchor.')
  }
  return { endExclusive: endIndex + 1, startIndex }
}

function splitEditText(text: string): string[] {
  const normalized = normalizeLineEndings(text)
  if (normalized.length === 0) return []

  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  return body.length === 0 ? [''] : body.split('\n')
}

function splitHtmlIntoDocumentLines(html: string): {
  finalNewline: boolean
  lines: string[]
} {
  const normalized = normalizeLineEndings(html)
  const finalNewline = normalized.endsWith('\n')
  if (normalized.length === 0) return { finalNewline, lines: [] }

  if (!finalNewline) return { finalNewline, lines: normalized.split('\n') }

  const body = normalized.slice(0, -1)
  return {
    finalNewline,
    lines: body.length === 0 ? [''] : body.split('\n'),
  }
}

function truncateLine(
  line: string,
  maxLineLength: number,
): { text: string; truncated: boolean } {
  if (line.length <= maxLineLength) {
    return { text: line, truncated: false }
  }
  return {
    text: `${line.slice(0, maxLineLength)}... [truncated]`,
    truncated: true,
  }
}

function validateHtmlDocumentShape(document: HtmlDocumentJsonV1) {
  if (document.version !== 1) {
    throw new Error('html.json version must be 1.')
  }
  if (document.lineEnding !== '\n' && document.lineEnding !== '\r\n') {
    throw new Error('html.json lineEnding must be LF or CRLF.')
  }
  if (typeof document.finalNewline !== 'boolean') {
    throw new Error('html.json finalNewline must be a boolean.')
  }
  if (!Number.isInteger(document.nextAnchor) || document.nextAnchor < 1) {
    throw new Error('html.json nextAnchor must be a positive integer.')
  }
  if (!Array.isArray(document.lines)) {
    throw new Error('html.json lines must be an array.')
  }

  const anchors = new Set<string>()
  for (const line of document.lines) {
    if (!Array.isArray(line) || line.length !== 2) {
      throw new Error('html.json lines must contain [anchor, text] tuples.')
    }
    const [anchor, text] = line
    if (typeof anchor !== 'string' || anchor.length === 0) {
      throw new Error('html.json line anchors must be non-empty strings.')
    }
    if (typeof text !== 'string') {
      throw new Error('html.json line text must be strings.')
    }
    if (anchors.has(anchor)) {
      throw new Error(`html.json contains duplicate anchor ${anchor}.`)
    }
    anchors.add(anchor)
  }

  if (
    document.checksum !== undefined &&
    !document.checksum.startsWith('sha256:')
  ) {
    throw new Error('html.json checksum must start with sha256:.')
  }
}
