/**
 * Pure tool-call display helpers extracted from `../route.ts`.
 *
 * These functions turn a Mastra tool name + its args/result into the concise
 * `action`/`detail`/`result` strings and image lists shown in the conversation
 * UI. They hold no route-loop, Mastra, or HTTP state — they are pure functions
 * of their arguments — which is why they live apart from the SSE stream loop.
 *
 * The SSE mapping in `route.ts` calls these for every `tool-call` /
 * `tool-error` / `tool-result` chunk; `startToolCallDisplay` /
 * `getToolCallDisplay` (still in `route.ts`, because they mutate the loop's
 * per-call display maps) call `defaultToolAction` + `summarizeToolArgs` from
 * here. `compactLines` is also exported because `route.ts`'s history-replay
 * builders use it.
 */

export type ToolArgs = Record<string, unknown>

export interface ToolCallDisplay {
  action: null | string
  detail: null | string
  id: string
  tool: string
}

const INVALID_EDIT_RESULT_MESSAGE =
  'Edit failed: the diff was missing or malformed. Retry with edit({ action, diff: "[index.html#TAG]\\nSWAP N.=M:\\n+TEXT" }) using the #TAG from your latest read/find.'

export function asToolArgs(value: unknown): ToolArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ToolArgs
}

/** Join trimmed, non-empty lines with `\n`; return null when none remain. */
export function compactLines(
  lines: Array<null | string | undefined>,
): null | string {
  const compacted = lines
    .map((line) => line?.trim())
    .filter((line): line is string => !!line)
  return compacted.length > 0 ? compacted.join('\n') : null
}

export function defaultToolAction(
  tool: string,
  args: ToolArgs,
): string | undefined {
  if (tool === 'edit') {
    // `edit` carries one top-level `action` label (a single hashline diff
    // per call); the SSE stream emits exactly one block per edit call.
    return stringValue(args.action)
  }

  if (tool === 'screenshot') {
    const selector = stringValue(args.selector)
    if (selector) return `Capture ${selector}`
    return 'Capture screenshot'
  }

  // `skill`/`skill_read` schemas have no `action` arg; derive one from their
  // other args so the UI reason column is populated instead of blank.
  if (tool === 'skill') {
    const name = stringValue(args.name)
    return name ? `Load skill: ${name}` : 'Load skill'
  }
  if (tool === 'skill_read') {
    const skillName = stringValue(args.skillName)
    const path = stringValue(args.path)
    if (skillName && path) return `Read ${skillName} reference: ${path}`
    if (skillName) return `Read ${skillName} reference`
    if (path) return `Read reference: ${path}`
    return 'Read skill reference'
  }

  return undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function isValidEditResult(result: unknown): boolean {
  const data = asToolArgs(result)
  return booleanValue(data.ok) === true
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

const summarizeArgsForTool: Record<string, (args: ToolArgs) => null | string> =
  {
    edit: (args) => stringValue(args.action) ?? null,
    find: (args) =>
      compactLines([
        stringValue(args.action),
        stringValue(args.text) ? `Text: ${stringValue(args.text)}` : null,
      ]),
    generate_image: (args) => {
      const action = stringValue(args.action)
      const prompt = stringValue(args.prompt)
      const aspectRatio = stringValue(args.aspectRatio)
      return compactLines([
        action,
        prompt && prompt !== action ? prompt : null,
        aspectRatio ? `Aspect ratio: ${aspectRatio}` : null,
      ])
    },
    grep: (args) =>
      compactLines([
        stringValue(args.action),
        stringValue(args.pattern)
          ? `Pattern: ${stringValue(args.pattern)}`
          : null,
      ]),
    read: (args) => {
      const from = stringValue(args.from)
      const to = stringValue(args.to)
      const limit = numberValue(args.limit)
      return compactLines([
        stringValue(args.action),
        from || to ? `Anchors: ${from ?? 'start'}${to ? `..${to}` : ''}` : null,
        limit ? `Limit: ${limit}` : null,
      ])
    },
    scrape: (args) =>
      compactLines([stringValue(args.action), stringValue(args.url)]),
    screenshot: (args) => {
      const selector = stringValue(args.selector)
      return compactLines([
        stringValue(args.action),
        selector ? `Selector: ${selector}` : null,
      ])
    },
    skill: (args) =>
      stringValue(args.name) ? `Skill: ${stringValue(args.name)}` : null,
    skill_read: (args) => {
      const skillName = stringValue(args.skillName)
      const path = stringValue(args.path)
      const startLine = numberValue(args.startLine)
      const endLine = numberValue(args.endLine)
      const range = startLine
        ? `:${startLine}${endLine ? `-${endLine}` : ''}`
        : ''
      return compactLines([
        skillName ? `Skill: ${skillName}` : null,
        path ? `Reference: ${path}${range}` : null,
      ])
    },
    skill_search: (args) => {
      const skillNames = stringArrayValue(args.skillNames)
      return compactLines([
        stringValue(args.query) ? `Query: ${stringValue(args.query)}` : null,
        skillNames.length > 0 ? `Skills: ${skillNames.join(', ')}` : null,
      ])
    },
  }

export function summarizeToolArgs(tool: string, args: ToolArgs): null | string {
  return summarizeArgsForTool[tool]?.(args) ?? stringValue(args.action) ?? null
}

export function summarizeToolError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const data = error as Record<string, unknown>
    const message = stringValue(data.message)
    if (message) return message
    const reason = stringValue(data.reason)
    if (reason) return reason
    const errorMessage = stringValue(data.error)
    if (errorMessage) return errorMessage
    const details = asToolArgs(data.details)
    const detailMessage = stringValue(details.errorMessage)
    if (detailMessage) return detailMessage
    try {
      return JSON.stringify(data)
    } catch {
      return String(error)
    }
  }
  return 'Tool failed.'
}

function summarizeFindOrGrepResult(data: ToolArgs): null | string {
  const matchCount = numberValue(data.matchCount)
  const truncated = booleanValue(data.truncatedLines)
  return typeof matchCount === 'number'
    ? `${matchCount} match${matchCount === 1 ? '' : 'es'}${truncated ? ' · truncated' : ''}`
    : null
}

const summarizeResultForTool: Record<
  string,
  (data: ToolArgs, reason: string | undefined) => null | string
> = {
  edit: (data) => {
    const bytes = numberValue(data.bytes)
    const tag = stringValue(data.tag)
    return typeof bytes === 'number'
      ? `Edited · ${bytes}B${typeof tag === 'string' ? ` · #${tag}` : ''}`
      : 'Edited'
  },
  find: summarizeFindOrGrepResult,
  generate_image: (data, reason) => {
    if (booleanValue(data.ok) === false) return reason ?? 'No image generated.'
    const count = numberValue(data.imagesGenerated)
    const url = stringValue(data.url)
    return compactLines([
      typeof count === 'number'
        ? `Generated ${count} image${count === 1 ? '' : 's'}`
        : 'Generated image',
      url,
    ])
  },
  grep: summarizeFindOrGrepResult,
  read: (data) => {
    const totalLines = numberValue(data.totalLines)
    const explicitLines = numberValue(data.lines)
    const startLine = numberValue(data.startLine)
    const endLine = numberValue(data.endLine)
    const lines =
      typeof explicitLines === 'number'
        ? explicitLines
        : typeof startLine === 'number' && typeof endLine === 'number'
          ? Math.max(0, endLine - startLine + 1)
          : undefined
    return typeof lines === 'number'
      ? `Read ${lines} line${lines === 1 ? '' : 's'}${typeof totalLines === 'number' ? ` of ${totalLines}` : ''}`
      : null
  },
  scrape: (data) => {
    const imageOcr = asToolArgs(data.imageOcr)
    const ocrImages = numberValue(imageOcr.imagesAnalyzed)
    return [
      stringValue(data.title) ?? stringValue(data.url),
      numberValue(data.charCount) !== undefined
        ? `${numberValue(data.charCount)} chars`
        : null,
      numberValue(data.linkCount) !== undefined
        ? `${numberValue(data.linkCount)} links`
        : null,
      numberValue(data.imageCount) !== undefined
        ? `${numberValue(data.imageCount)} images`
        : null,
      ocrImages && ocrImages > 0 ? `OCR ${ocrImages} images` : null,
    ]
      .filter((part): part is string => !!part)
      .join(' · ')
  },
  screenshot: (data, reason) => {
    if (booleanValue(data.ok) === false) {
      return reason ?? 'Screenshot analysis failed.'
    }
    const imageOcr = asToolArgs(data.imageOcr)
    const ocrImages = numberValue(imageOcr.imagesAnalyzed)
    const captures = Array.isArray(data.captures) ? data.captures : []
    const viewportNames = captures
      .map((capture) => stringValue((capture as ToolArgs).viewport))
      .filter((v): v is string => Boolean(v))
    return compactLines([
      viewportNames.length > 0
        ? `Captured ${viewportNames.join(', ')}`
        : captures.length > 0
          ? `Captured ${captures.length} viewport${captures.length === 1 ? '' : 's'}`
          : 'Captured screenshot',
      ocrImages && ocrImages > 0
        ? `OCR ${ocrImages} image${ocrImages === 1 ? '' : 's'}`
        : null,
    ])
  },
  skill: () => 'Loaded skill instructions',
  skill_read: () => 'Loaded reference content',
  skill_search: () => 'Search complete',
}

/** Expand a root-relative screenshot URL to an absolute one using the
 *  request baseUrl, mirroring toolCallImages for the screenshot tool. */
export function expandScreenshotUrl(imageUrl: string, baseUrl: string): string {
  try {
    return new URL(imageUrl, baseUrl).href
  } catch {
    return imageUrl
  }
}

export function summarizeToolResult(
  tool: string,
  result: unknown,
  isError: boolean,
): null | string {
  const data = asToolArgs(result)
  const reason = stringValue(data.reason)
  if (isError) {
    if (tool === 'edit' && !isValidEditResult(result)) {
      return reason ?? INVALID_EDIT_RESULT_MESSAGE
    }
    return reason ?? summarizeToolError(result)
  }
  return summarizeResultForTool[tool]?.(data, reason) ?? null
}

export function toolCallImages(tool: string, result: unknown, baseUrl: string) {
  if (tool !== 'screenshot') return []

  const data = asToolArgs(result)
  const captures = Array.isArray(data.captures) ? data.captures : []
  const selector = stringValue(data.selector) ?? 'selected element'

  return captures
    .map((capture) => {
      const imageUrl = stringValue((capture as ToolArgs).imageUrl)
      const viewport = stringValue((capture as ToolArgs).viewport)
      if (!imageUrl) return null
      try {
        return {
          alt: `Screenshot of ${selector}${viewport ? ` at ${viewport} viewport` : ''}`,
          url: new URL(imageUrl, baseUrl).href,
        }
      } catch {
        return null
      }
    })
    .filter((entry): entry is { alt: string; url: string } => entry !== null)
}

export function toolResultIndicatesFailure(
  tool: string,
  result: unknown,
): boolean {
  const data = asToolArgs(result)
  if (tool === 'edit') return !isValidEditResult(result)
  return booleanValue(data.ok) === false
}
