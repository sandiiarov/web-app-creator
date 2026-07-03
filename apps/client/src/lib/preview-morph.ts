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
  morphElement(root, targetRoot)

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

function canMorphNode(current: Node, target: Node): boolean {
  if (current.nodeType !== target.nodeType) return false
  if (isElement(current) && isElement(target)) {
    return current.tagName === target.tagName
  }
  return true
}

function findMatchingExistingChild(
  start: ChildNode,
  target: ChildNode,
): ChildNode | null {
  if (!isElement(target)) return null

  const targetId = target.id
  if (!targetId) return null

  for (
    let current: ChildNode | null = start;
    current;
    current = current.nextSibling
  ) {
    if (
      isElement(current) &&
      current.id === targetId &&
      current.tagName === target.tagName
    ) {
      return current
    }
  }

  return null
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function morphChildren(current: Element, target: Element) {
  let currentChild = current.firstChild
  let targetChild = target.firstChild

  while (targetChild) {
    const nextTargetChild = targetChild.nextSibling

    if (!currentChild) {
      current.appendChild(targetChild.cloneNode(true))
      targetChild = nextTargetChild
      continue
    }

    const matchingChild = findMatchingExistingChild(currentChild, targetChild)
    if (matchingChild && matchingChild !== currentChild) {
      current.insertBefore(matchingChild, currentChild)
    }

    const morphedChild = morphNode(matchingChild ?? currentChild, targetChild)
    currentChild = morphedChild.nextSibling
    targetChild = nextTargetChild
  }

  while (currentChild) {
    const nextCurrentChild = currentChild.nextSibling
    currentChild.remove()
    currentChild = nextCurrentChild
  }
}

function morphElement(current: Element, target: Element) {
  syncAttributes(current, target)
  morphChildren(current, target)
}

function morphNode(current: Node, target: Node): Node {
  if (!canMorphNode(current, target)) {
    const replacement = target.cloneNode(true)
    current.parentNode?.replaceChild(replacement, current)
    return replacement
  }

  if (isElement(current) && isElement(target)) {
    morphElement(current, target)
    return current
  }

  if (current.nodeValue !== target.nodeValue)
    current.nodeValue = target.nodeValue
  return current
}

function parsePreviewRoot(doc: Document, html: string): HTMLElement {
  const targetDoc = doc.implementation.createHTMLDocument('')
  targetDoc.open()
  targetDoc.write(html)
  targetDoc.close()
  return targetDoc.documentElement
}

function syncAttributes(current: Element, target: Element) {
  for (const attribute of Array.from(current.attributes)) {
    if (!target.hasAttribute(attribute.name))
      current.removeAttribute(attribute.name)
  }

  for (const attribute of Array.from(target.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value)
    }
  }
}
