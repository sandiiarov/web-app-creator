import { getServerBridge, stream, VirtualFS, ViteDevServer } from 'almostnode'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

const BIPPY_VERSION = '0.5.41'
const EDITABLE_FILE_PATHS = ['/src/App.tsx', '/src/style.css'] as const
const INSPECTOR_CONTROL_MESSAGE = 'web-app-creator:inspector-control'
const INSPECTOR_SELECTION_MESSAGE = 'web-app-creator:element-selected'
const INSPECTOR_SHORTCUT_MESSAGE = 'web-app-creator:inspector-shortcut'
const PREVIEW_PORT = 5174
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

type Bridge = ReturnType<typeof getServerBridge>
type BridgeServer = Parameters<Bridge['registerServer']>[0]
type EditableFile = {
  content: string
  path: EditableFilePath
}

type EditableFilePath = (typeof EDITABLE_FILE_PATHS)[number]

type EditResponse = {
  files: EditableFile[]
  summary?: string
}

type ElementDescriptor = {
  className?: string
  id?: string
  rect: {
    height: number
    width: number
    x: number
    y: number
  }
  tagName: string
  text?: string
}

type InspectorSelectionMessage = {
  payload: SelectedElement
  type: typeof INSPECTOR_SELECTION_MESSAGE
}

type InspectorShortcutMessage = {
  type: typeof INSPECTOR_SHORTCUT_MESSAGE
}

type RequestBody = Parameters<BridgeServer['handleRequest']>[3]

type SelectedElement = {
  componentName?: string
  element: ElementDescriptor
  ownerStack: string[]
  source?: null | SourceLocation
}

type SourceLocation = {
  columnNumber?: number
  fileName: string
  lineNumber?: number
}

type ViteRequestBody = Parameters<ViteDevServer['handleRequest']>[3]

// fallow-ignore-next-line complexity
export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const serverRef = useRef<null | ViteDevServer>(null)
  const vfsRef = useRef<null | VirtualFS>(null)
  const [editStatus, setEditStatus] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedElement, setSelectedElement] =
    useState<null | SelectedElement>(null)

  const postInspectorEnabled = useCallback((enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        enabled,
        type: INSPECTOR_CONTROL_MESSAGE,
      },
      '*',
    )
  }, [])

  const setSelectionMode = useCallback(
    (enabled: boolean) => {
      setIsSelectionMode(enabled)
      postInspectorEnabled(enabled)
    },
    [postInspectorEnabled],
  )

  useEffect(() => {
    const bridge = getServerBridge()
    let disposed = false
    let previewServer: null | ViteDevServer = null

    async function startPreview() {
      const vfs = new VirtualFS()
      createViteProject(vfs)
      vfsRef.current = vfs

      previewServer = new ViteDevServer(vfs, {
        port: PREVIEW_PORT,
        root: '/',
      })
      serverRef.current = previewServer
      previewServer.start()

      await bridge.initServiceWorker()

      if (disposed) {
        previewServer.stop()
        return
      }

      bridge.registerServer(createBridgeServer(previewServer), PREVIEW_PORT)
      setPreviewUrl(`${bridge.getServerUrl(PREVIEW_PORT)}/`)
    }

    void startPreview().catch((caught) => {
      if (!disposed) {
        setError(errorMessage(caught))
      }
    })

    return () => {
      disposed = true
      bridge.unregisterServer(PREVIEW_PORT)
      previewServer?.stop()
      serverRef.current = null
      vfsRef.current = null
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        setSelectionMode(true)
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [setSelectionMode])

  useEffect(() => {
    // fallow-ignore-next-line complexity
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return
      }

      if (isInspectorShortcutMessage(event.data)) {
        setSelectionMode(true)
        inputRef.current?.focus()
        return
      }

      if (isInspectorSelectionMessage(event.data)) {
        setSelectedElement(event.data.payload)
        setSelectionMode(false)
        inputRef.current?.focus()
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [setSelectionMode])

  // fallow-ignore-next-line complexity
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const editPrompt = prompt.trim()
    const vfs = vfsRef.current

    if (!editPrompt || isEditing || !vfs) {
      return
    }

    setEditStatus('Asking AI to update the preview…')
    setError(null)
    setIsEditing(true)

    try {
      const edit = await requestEdit({
        files: readEditableFiles(vfs),
        prompt: editPrompt,
        selection: selectedElement,
      })
      applyEdit(vfs, edit)
      setEditStatus(edit.summary ?? 'Preview updated.')
      setPrompt('')
    } catch (caught) {
      setEditStatus(null)
      setError(errorMessage(caught))
    } finally {
      setIsEditing(false)
    }
  }

  function handlePreviewLoad() {
    const contentWindow = iframeRef.current?.contentWindow
    const server = serverRef.current

    if (contentWindow && server) {
      server.setHMRTarget(contentWindow)
      postInspectorEnabled(isSelectionMode)
    }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {error ? (
        <div className="pointer-events-none fixed inset-x-4 top-4 z-20 mx-auto max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-2xl backdrop-blur">
          {error}
        </div>
      ) : null}
      <iframe
        className="h-svh w-screen border-0"
        onLoad={handlePreviewLoad}
        ref={iframeRef}
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        src={previewUrl || 'about:blank'}
        title="Browser Vite preview"
      />
      <form
        className="fixed inset-x-4 bottom-4 z-10 mx-auto max-w-3xl rounded-3xl border bg-background/90 p-3 shadow-2xl backdrop-blur"
        onSubmit={handleSubmit}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <button
            className={selectionButtonClassName(isSelectionMode)}
            onClick={() => setSelectionMode(!isSelectionMode)}
            type="button"
          >
            {isSelectionMode ? 'Click an element…' : 'Select element'}
            <kbd className="ml-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘G
            </kbd>
          </button>
          <span className="min-w-0 flex-1 truncate">
            {selectedElement
              ? selectedElementLabel(selectedElement)
              : 'Ask for a change, or select an element first.'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            aria-label="AI edit prompt"
            className="min-w-0 flex-1 rounded-2xl border bg-background px-4 py-3 text-sm transition outline-none focus:border-primary"
            disabled={isEditing}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Make the selected card glassier, change the heading, add a gradient…"
            ref={inputRef}
            type="text"
            value={prompt}
          />
          <button
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isEditing || prompt.trim().length === 0}
            type="submit"
          >
            {isEditing ? 'Applying…' : 'Apply'}
          </button>
        </div>
        {editStatus ? (
          <p className="mt-2 text-xs text-muted-foreground">{editStatus}</p>
        ) : null}
      </form>
    </main>
  )
}

function applyEdit(vfs: VirtualFS, edit: EditResponse) {
  const files = edit.files.filter((file) => isEditableFilePath(file.path))

  if (files.length === 0) {
    throw new Error('AI did not return any editable files.')
  }

  for (const file of files) {
    vfs.writeFileSync(file.path, file.content)
  }
}

function createBridgeServer(devServer: ViteDevServer): BridgeServer {
  return {
    address: () => ({
      address: '0.0.0.0',
      family: 'IPv4',
      port: devServer.getPort(),
    }),
    handleRequest: (method, url, headers, body) =>
      devServer.handleRequest(method, url, headers, normalizeRequestBody(body)),
    listening: true,
  }
}

function createViteProject(vfs: VirtualFS) {
  vfs.writeFileSync(
    '/package.json',
    JSON.stringify(
      {
        dependencies: {
          '@vitejs/plugin-react': '^6.0.2',
          bippy: `^${BIPPY_VERSION}`,
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          vite: '^8.0.14',
        },
        devDependencies: {},
        name: 'browser-vite-preview',
        private: true,
        scripts: {
          dev: 'vite',
        },
        type: 'module',
      },
      null,
      2,
    ),
  )

  vfs.writeFileSync(
    '/index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Browser Vite Preview</title>
    <script type="importmap">
      {
        "imports": {
          "bippy": "https://esm.sh/bippy@${BIPPY_VERSION}?external=react",
          "bippy/source": "https://esm.sh/bippy@${BIPPY_VERSION}/source?external=react",
          "react": "https://esm.sh/react@18.2.0?dev",
          "react/": "https://esm.sh/react@18.2.0&dev/",
          "react-dom": "https://esm.sh/react-dom@18.2.0?dev",
          "react-dom/": "https://esm.sh/react-dom@18.2.0&dev/"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
  )

  vfs.writeFileSync(
    '/src/main.tsx',
    `import 'bippy'
import { installInspector } from './inspector.ts'
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import './style.css'

installInspector()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
  )

  vfs.writeFileSync(
    '/src/inspector.ts',
    `import {
  getDisplayName,
  getFiberFromHostInstance,
  getFiberStack,
  getLatestFiber,
  isCompositeFiber,
  type Fiber,
} from 'bippy'
import { getSource } from 'bippy/source'

const CONTROL_MESSAGE = '${INSPECTOR_CONTROL_MESSAGE}'
const SELECTION_MESSAGE = '${INSPECTOR_SELECTION_MESSAGE}'
const SHORTCUT_MESSAGE = '${INSPECTOR_SHORTCUT_MESSAGE}'

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
  const text = element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 140)

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
`,
  )

  vfs.writeFileSync(
    '/src/App.tsx',
    `import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <section className="preview-shell">
      <div className="preview-card">
        <p className="eyebrow">almostnode + Vite</p>
        <h1>Vite is running inside your browser.</h1>
        <p>
          This iframe is served by an in-memory Vite dev server backed by
          almostnode&apos;s VirtualFS and service worker bridge.
        </p>
        <button onClick={() => setCount((value) => value + 1)}>
          Count: {count}
        </button>
      </div>
    </section>
  )
}
`,
  )

  vfs.writeFileSync(
    '/src/style.css',
    `:root {
  color: white;
  background: #09090b;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button {
  border: 0;
  border-radius: 999px;
  background: #facc15;
  color: #18181b;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 0.85rem 1.2rem;
}

.preview-shell {
  align-items: center;
  background:
    radial-gradient(circle at top left, rgb(250 204 21 / 0.3), transparent 32rem),
    linear-gradient(135deg, #18181b 0%, #09090b 55%, #27272a 100%);
  display: flex;
  min-height: 100vh;
  padding: clamp(1.5rem, 6vw, 5rem);
}

.preview-card {
  backdrop-filter: blur(20px);
  background: rgb(255 255 255 / 0.08);
  border: 1px solid rgb(255 255 255 / 0.16);
  border-radius: 2rem;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.4);
  display: grid;
  gap: 1.25rem;
  max-width: 42rem;
  padding: clamp(1.5rem, 5vw, 4rem);
}

.preview-card h1 {
  font-size: clamp(2.5rem, 8vw, 5.5rem);
  letter-spacing: -0.07em;
  line-height: 0.9;
  margin: 0;
}

.preview-card p {
  color: rgb(255 255 255 / 0.72);
  font-size: clamp(1rem, 2vw, 1.2rem);
  line-height: 1.7;
  margin: 0;
}

.eyebrow {
  color: #facc15 !important;
  font-size: 0.8rem !important;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
`,
  )
}

function errorFromPayload(payload: unknown) {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to update preview.'
}

function isEditableFilePath(path: string): path is EditableFilePath {
  return EDITABLE_FILE_PATHS.some((filePath) => filePath === path)
}

function isEditResponse(value: unknown): value is EditResponse {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    return false
  }

  return value.files.every(
    (file) =>
      isRecord(file) &&
      typeof file.content === 'string' &&
      typeof file.path === 'string' &&
      isEditableFilePath(file.path),
  )
}

function isInspectorSelectionMessage(
  value: unknown,
): value is InspectorSelectionMessage {
  return (
    isRecord(value) &&
    value.type === INSPECTOR_SELECTION_MESSAGE &&
    isRecord(value.payload)
  )
}

function isInspectorShortcutMessage(
  value: unknown,
): value is InspectorShortcutMessage {
  return isRecord(value) && value.type === INSPECTOR_SHORTCUT_MESSAGE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeRequestBody(body: RequestBody): ViteRequestBody {
  if (body === undefined) {
    return undefined
  }

  return typeof body === 'string' ? stream.Buffer.from(body) : body
}

function readEditableFiles(vfs: VirtualFS): EditableFile[] {
  return EDITABLE_FILE_PATHS.map((path) => ({
    content: vfs.readFileSync(path, 'utf8'),
    path,
  }))
}

async function requestEdit(body: {
  files: EditableFile[]
  prompt: string
  selection: null | SelectedElement
}) {
  const response = await fetch(`${SERVER_URL}/api/edit`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(errorFromPayload(payload) ?? 'AI edit request failed.')
  }

  if (!isEditResponse(payload)) {
    throw new Error('AI edit response did not match the expected format.')
  }

  return payload
}

function selectedElementLabel(selection: SelectedElement) {
  const source = selection.source
  const sourceLabel = source
    ? `${source.fileName}${source.lineNumber ? `:${source.lineNumber}` : ''}`
    : '/src/App.tsx'
  const target = selection.componentName ?? selection.element.tagName

  return `Selected ${target} at ${sourceLabel}`
}

function selectionButtonClassName(isSelectionMode: boolean) {
  return [
    'rounded-full border px-3 py-1.5 font-medium transition',
    isSelectionMode
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-muted text-muted-foreground hover:text-foreground',
  ].join(' ')
}
