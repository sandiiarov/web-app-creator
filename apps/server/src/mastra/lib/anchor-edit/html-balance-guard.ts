/** Per-tag open/close counts for one container tag. */
export interface BalanceDetail {
  closes: number
  /** Opens minus self-closing opens (`<tag ... />`). */
  netOpen: number
  tag: string
}

export interface HtmlBalanceResult {
  issues: string[]
  ok: boolean
}

/**
 * HTML container tags whose open/close balance matters for correct rendering.
 * Void elements (br, img, meta, input, …) are intentionally excluded — they
 * never need a closer.
 */
export const CONTAINER_TAGS = [
  'html',
  'head',
  'body',
  'style',
  'script',
  'noscript',
  'main',
  'header',
  'footer',
  'section',
  'nav',
  'article',
  'aside',
  'div',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'ul',
  'ol',
  'li',
  'span',
  'p',
  'a',
  'form',
  'button',
  'select',
  'option',
  'textarea',
  'label',
  'fieldset',
  'legend',
  'figure',
  'figcaption',
  'details',
  'summary',
  'picture',
  'video',
  'audio',
  'canvas',
  'svg',
  'iframe',
  'blockquote',
  'dl',
  'dt',
  'dd',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const

/**
 * Text-level open/close balance check for HTML container tags. Catches edits
 * that delete or duplicate a structural tag — e.g. an eaten `</style>` or
 * `</head>` (the root cause this engine was adopted to prevent) — which HTML
 * parsers silently tolerate but which corrupt the rendered page. Returns
 * `ok: false` with the offending tags and their open/close counts.
 *
 * This is a literal-tag COUNT, deliberately not a parser: parsers auto-insert
 * missing closers and drop stray ones, hiding the very imbalance we must
 * reject at the edit boundary.
 */
export function checkHtmlBalance(html: string): HtmlBalanceResult {
  const issues: string[] = []
  for (const { closes, netOpen, tag } of computeTagBalance(html)) {
    if (netOpen !== closes) {
      issues.push(`<${tag}>: ${netOpen} open vs ${closes} close`)
    }
  }
  return { issues, ok: issues.length === 0 }
}

/**
 * Count literal open/close occurrences for every container tag. Used by
 * `checkHtmlBalance` (which turns imbalances into human-readable messages).
 */
export function computeTagBalance(html: string): BalanceDetail[] {
  const details: BalanceDetail[] = []
  for (const tag of CONTAINER_TAGS) {
    const t = escapeRegex(tag)
    // Opens: `<tag` immediately followed by whitespace, `>`, or `/>` (skips
    // `</tag>` closers and unrelated tags like `<divider>`).
    const opens = countMatches(html, new RegExp(`<${t}(?=\\s|>|\\/>)`, 'gi'))
    // Self-closing opens (`<tag ... />`) don't need a closer — subtract them.
    const selfClosed = countMatches(
      html,
      new RegExp(`<${t}\\b[^>]*?\\/>`, 'gi'),
    )
    // Closes: `</tag>` (optionally followed by whitespace before `>`).
    const closes = countMatches(html, new RegExp(`<\\/${t}(?=\\s|>)`, 'gi'))
    details.push({ closes, netOpen: opens - selfClosed, tag })
  }
  return details
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NESTING_TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g

/**
 * Stack-walk the document's container tags in source order. Returns the tags
 * still open at EOF and whether any closer arrived out of order (a
 * mis-nesting signature). Void elements are excluded by `CONTAINER_TAGS`
 * membership; self-closing containers (`<div/>`) are skipped. Used by the edit
 * engine to decide whether a truncation repair is safe — never to validate
 * well-formedness generally.
 */
export function scanNesting(html: string): {
  mismatch: boolean
  stack: string[]
} {
  const stack: string[] = []
  for (const m of html.matchAll(NESTING_TAG_RE)) {
    const tag = (m[2] ?? '').toLowerCase()
    if (!(CONTAINER_TAGS as readonly string[]).includes(tag)) continue
    if ((m[3] ?? '').endsWith('/')) continue // self-closing
    if (m[1] === '/') {
      if (stack[stack.length - 1] === tag) stack.pop()
      else return { mismatch: true, stack }
    } else {
      stack.push(tag)
    }
  }
  return { mismatch: false, stack }
}
