import { getServerBridge, stream, VirtualFS, ViteDevServer } from 'almostnode'
import { useEffect, useRef, useState } from 'react'

const PREVIEW_PORT = 5174

type Bridge = ReturnType<typeof getServerBridge>
type BridgeServer = Parameters<Bridge['registerServer']>[0]
type RequestBody = Parameters<BridgeServer['handleRequest']>[3]
type ViteRequestBody = Parameters<ViteDevServer['handleRequest']>[3]

export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const serverRef = useRef<null | ViteDevServer>(null)
  const [error, setError] = useState<null | string>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    const bridge = getServerBridge()
    let disposed = false
    let previewServer: null | ViteDevServer = null

    async function startPreview() {
      const vfs = new VirtualFS()
      createViteProject(vfs)

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
    }
  }, [])

  function handlePreviewLoad() {
    const contentWindow = iframeRef.current?.contentWindow
    const server = serverRef.current

    if (contentWindow && server) {
      server.setHMRTarget(contentWindow)
    }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {error ? (
        <div className="grid h-svh w-screen place-items-center p-6 text-center text-sm text-destructive">
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
    </main>
  )
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
          react: '^19.2.6',
          'react-dom': '^19.2.6',
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
    `import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to start preview.'
}

function normalizeRequestBody(body: RequestBody): ViteRequestBody {
  if (body === undefined) {
    return undefined
  }

  return typeof body === 'string' ? stream.Buffer.from(body) : body
}
