const PREVIEW_BASE_TAG = '<base href="about:srcdoc" data-preview-base="true" />'

export function preparePreviewSrcDoc(html: string): string {
  if (html.includes('data-preview-base="true"')) return html

  const headOpen = /<head\b[^>]*>/i.exec(html)
  if (headOpen) {
    const insertAt = headOpen.index + headOpen[0].length
    return `${html.slice(0, insertAt)}\n    ${PREVIEW_BASE_TAG}${html.slice(insertAt)}`
  }

  const htmlOpen = /<html\b[^>]*>/i.exec(html)
  if (htmlOpen) {
    const insertAt = htmlOpen.index + htmlOpen[0].length
    return `${html.slice(0, insertAt)}\n  <head>\n    ${PREVIEW_BASE_TAG}\n  </head>${html.slice(insertAt)}`
  }

  return `<head>\n  ${PREVIEW_BASE_TAG}\n</head>\n${html}`
}
