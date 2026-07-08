export interface HtmlBalanceResult {
  ok: boolean
  issues: string[]
}

/**
 * HTML container tags whose open/close balance matters for correct rendering.
 * Void elements (br, img, meta, input, …) are intentionally excluded — they
 * never need a closer.
 */
const CONTAINER_TAGS = [
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length
}

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
    const netOpen = opens - selfClosed
    if (netOpen !== closes) {
      issues.push(`<${tag}>: ${netOpen} open vs ${closes} close`)
    }
  }
  return { ok: issues.length === 0, issues }
}
