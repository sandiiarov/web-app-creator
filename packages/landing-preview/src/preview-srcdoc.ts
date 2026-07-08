const PREVIEW_BASE_TAG = '<base href="about:srcdoc" data-preview-base="true" />'

export function preparePreviewSrcDoc(html: string): string {
  const repaired = closeUnclosedStyleTags(html)
  if (repaired.includes('data-preview-base="true"')) return repaired

  const headOpen = /<head\b[^>]*>/i.exec(repaired)
  if (headOpen) {
    const insertAt = headOpen.index + headOpen[0].length
    return `${repaired.slice(0, insertAt)}\n    ${PREVIEW_BASE_TAG}${repaired.slice(insertAt)}`
  }

  const htmlOpen = /<html\b[^>]*>/i.exec(repaired)
  if (htmlOpen) {
    const insertAt = htmlOpen.index + htmlOpen[0].length
    return `${repaired.slice(0, insertAt)}\n  <head>\n    ${PREVIEW_BASE_TAG}\n  </head>${repaired.slice(insertAt)}`
  }

  return `<head>\n  ${PREVIEW_BASE_TAG}\n</head>\n${repaired}`
}

/**
 * Close any unclosed <style> tags before the document body opens. Models
 * occasionally emit a <style> block with no matching </style>; the HTML parser
 * then treats everything after (including <body> and all page content) as CSS
 * text inside the style element, so the preview renders with an empty body.
 * Inserting the missing </style> before <body> restores a normal parse.
 */
function closeUnclosedStyleTags(html: string): string {
  const open = (html.match(/<style\b/gi) ?? []).length
  const close = (html.match(/<\/style\s*>/gi) ?? []).length
  const missing = open - close
  if (missing <= 0) return html
  const bodyMatch = /<body\b[^>]*>/i.exec(html)
  const insertAt = bodyMatch ? bodyMatch.index : html.length
  return `${html.slice(0, insertAt)}${'</style>'.repeat(missing)}${html.slice(insertAt)}`
}
