import morphdom from 'morphdom'

import { preparePreviewSrcDoc } from './preview-srcdoc'

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi

export function getScriptSignature(html: string): string {
  return Array.from(html.matchAll(SCRIPT_TAG_PATTERN), (match) => {
    const attributes = (match[1] ?? '').trim()
    const content = match[2] ?? ''
    return `<script ${attributes}>${content}</script>`
  }).join('\n---preview-script---\n')
}

export function morphPreviewDocument(
  doc: Document,
  html: string,
  options: { rerunScripts?: boolean } = {},
) {
  const root = doc.documentElement
  if (!root) throw new Error('Preview document is not ready.')

  const targetRoot = parsePreviewRoot(doc, preparePreviewMorphHtml(html))
  morphdom(root, targetRoot)

  if (options.rerunScripts) rerunPreviewScripts(doc)
}

export function preparePreviewMorphHtml(html: string): string {
  return preparePreviewSrcDoc(html)
}

export function rerunPreviewScripts(doc: Document) {
  for (const script of Array.from(doc.scripts)) {
    const nextScript = doc.createElement('script')
    for (const attribute of Array.from(script.attributes)) {
      nextScript.setAttribute(attribute.name, attribute.value)
    }
    if (!script.hasAttribute('async')) nextScript.async = false
    nextScript.text = script.text
    script.replaceWith(nextScript)
  }
}

export function shouldRerunScriptsAfterMorph(
  previousHtml: string,
  nextHtml: string,
): boolean {
  return getScriptSignature(previousHtml) !== getScriptSignature(nextHtml)
}

function parsePreviewRoot(doc: Document, html: string): HTMLElement {
  const targetDoc = doc.implementation.createHTMLDocument('')
  targetDoc.open()
  targetDoc.write(html)
  targetDoc.close()
  return targetDoc.documentElement
}
