import { Idiomorph } from 'idiomorph'

import { preparePreviewSrcDoc } from './preview-srcdoc'

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi

export function getScriptSignature(html: string): string {
  return Array.from(html.matchAll(SCRIPT_TAG_PATTERN), (match) => {
    const attributes = (match[1] ?? '').trim()
    const content = match[2] ?? ''
    return `<script ${attributes}>${content}</script>`
  }).join('\n---preview-script---\n')
}

export function morphPreviewDocument(doc: Document, html: string) {
  const root = doc.documentElement
  if (!root) throw new Error('Preview document is not ready.')

  Idiomorph.morph(root, preparePreviewMorphHtml(html), {
    head: { style: 'morph' },
    restoreFocus: true,
  })
}

export function preparePreviewMorphHtml(html: string): string {
  return preparePreviewSrcDoc(html)
}

export function shouldReloadForScriptChange(
  previousHtml: string,
  nextHtml: string,
): boolean {
  return getScriptSignature(previousHtml) !== getScriptSignature(nextHtml)
}
