import {
  getDisplayName,
  getFiberFromHostInstance,
  getFiberStack,
  getLatestFiber,
  isCompositeFiber,
  type Fiber,
} from 'bippy'
import { getSource } from 'bippy/source'

const CONTROL_MESSAGE = '__INSPECTOR_CONTROL_MESSAGE__'
const SELECTION_MESSAGE = '__INSPECTOR_SELECTION_MESSAGE__'
const SHORTCUT_MESSAGE = '__INSPECTOR_SHORTCUT_MESSAGE__'

let highlightElement: HTMLDivElement | null = null
let selectionEnabled = false

export function installInspector() {
  window.addEventListener('message', handleControlMessage)
  window.addEventListener('click', handleClick, true)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousemove', handleMouseMove, true)
}

async function createSelection(element: Element) {
  const fiber = getElementFiber(element)
  const compositeFiber = findCompositeFiber(fiber)
  const source = compositeFiber ? await readSource(compositeFiber) : null

  return {
    componentName: compositeFiber ? getDisplayName(compositeFiber) : undefined,
    element: describeElement(element),
    ownerStack: fiber
      ? getFiberStack(fiber)
          .map((stackFiber) => getDisplayName(stackFiber))
          .filter(Boolean)
      : [],
    source,
  }
}

function describeElement(element: Element) {
  const rect = element.getBoundingClientRect()
  const text = element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 140)

  return {
    className: element.getAttribute('class') ?? undefined,
    id: element.id || undefined,
    rect: {
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    },
    tagName: element.tagName.toLowerCase(),
    text: text || undefined,
  }
}

function findCompositeFiber(fiber: Fiber | null) {
  let current = fiber

  while (current) {
    if (isCompositeFiber(current)) {
      return current
    }

    current = current.return
  }

  return null
}

function getElementFiber(element: Element) {
  try {
    const fiber = getFiberFromHostInstance(element)

    return fiber ? getLatestFiber(fiber) : null
  } catch {
    return null
  }
}

function handleClick(event: MouseEvent) {
  if (!selectionEnabled) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void selectElement(event.target)
}

function handleControlMessage(event: MessageEvent) {
  if (event.data?.type !== CONTROL_MESSAGE) {
    return
  }

  selectionEnabled = Boolean(event.data.enabled)
  document.documentElement.style.cursor = selectionEnabled ? 'crosshair' : ''

  if (!selectionEnabled) {
    removeHighlight()
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.metaKey && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    window.parent.postMessage({ type: SHORTCUT_MESSAGE }, '*')
  }
}

function handleMouseMove(event: MouseEvent) {
  if (!selectionEnabled) {
    return
  }

  const element = event.target

  if (element instanceof Element) {
    showHighlight(element)
  }
}

function normalizeSource(source: Awaited<ReturnType<typeof getSource>>) {
  if (!source) {
    return null
  }

  return {
    columnNumber: source.columnNumber,
    fileName: normalizeVirtualFileName(source.fileName),
    lineNumber: source.lineNumber,
  }
}

function normalizeVirtualFileName(fileName: string) {
  const srcIndex = fileName.indexOf('/src/')

  return srcIndex >= 0 ? fileName.slice(srcIndex) : fileName
}

async function readSource(fiber: Fiber) {
  try {
    return normalizeSource(await getSource(fiber))
  } catch {
    return null
  }
}

function removeHighlight() {
  highlightElement?.remove()
  highlightElement = null
}

async function selectElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return
  }

  const selection = await createSelection(target)
  selectionEnabled = false
  document.documentElement.style.cursor = ''
  showHighlight(target, true)
  window.parent.postMessage(
    {
      payload: selection,
      type: SELECTION_MESSAGE,
    },
    '*',
  )
}

function showHighlight(element: Element, persist = false) {
  const rect = element.getBoundingClientRect()
  const highlight = highlightElement ?? document.createElement('div')
  highlight.style.background = persist
    ? 'rgb(250 204 21 / 0.12)'
    : 'rgb(250 204 21 / 0.08)'
  highlight.style.border = '2px solid #facc15'
  highlight.style.borderRadius = '8px'
  highlight.style.boxShadow = '0 0 0 9999px rgb(0 0 0 / 0.12)'
  highlight.style.height = String(rect.height) + 'px'
  highlight.style.left = String(rect.left) + 'px'
  highlight.style.pointerEvents = 'none'
  highlight.style.position = 'fixed'
  highlight.style.top = String(rect.top) + 'px'
  highlight.style.width = String(rect.width) + 'px'
  highlight.style.zIndex = '2147483647'

  if (!highlightElement) {
    document.documentElement.appendChild(highlight)
    highlightElement = highlight
  }
}
