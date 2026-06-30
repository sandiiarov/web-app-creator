import { getServerBridge, VirtualFS, ViteDevServer } from 'almostnode'
import { useCallback, useEffect, useRef, useState } from 'react'

import { createBridgeServer } from '../lib/preview-bridge'

const PREVIEW_PORT = 5174
const EMPTY_HTML =
  '<!doctype html><html><head><title>Landing preview</title></head><body></body></html>'

export type UseLandingPreviewServerOptions = {
  html: string
  onError?: (message: string) => void
}

export function useLandingPreviewServer({
  html,
  onError,
}: UseLandingPreviewServerOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const serverRef = useRef<null | ViteDevServer>(null)
  const vfsRef = useRef<null | VirtualFS>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const handlePreviewLoad = useCallback(() => {
    const contentWindow = iframeRef.current?.contentWindow
    const server = serverRef.current

    if (contentWindow && server) {
      server.setHMRTarget(contentWindow)
      console.log('[landing-preview] HMR target attached')
    }
  }, [])

  useEffect(() => {
    const bridge = getServerBridge()
    let disposed = false
    let previewServer: null | ViteDevServer = null

    async function startPreview() {
      const vfs = new VirtualFS()
      vfs.writeFileSync('/index.html', html.trim() ? html : EMPTY_HTML)
      vfsRef.current = vfs

      previewServer = new ViteDevServer(vfs, {
        port: PREVIEW_PORT,
        root: '/',
      })
      serverRef.current = previewServer
      previewServer.start()
      previewServer.on('hmr-update', (update) => {
        console.log('[landing-preview] Vite HMR update', update)
      })

      await bridge.initServiceWorker()

      if (disposed) {
        previewServer.stop()
        return
      }

      bridge.registerServer(createBridgeServer(previewServer), PREVIEW_PORT)
      const url = `${bridge.getServerUrl(PREVIEW_PORT)}/`
      console.log('[landing-preview] almostnode Vite server ready', { url })
      setPreviewUrl(url)
    }

    void startPreview().catch((error) => {
      if (!disposed) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          '[landing-preview] failed to start almostnode Vite server',
          error,
        )
        onError?.(message)
      }
    })

    return () => {
      disposed = true
      bridge.unregisterServer(PREVIEW_PORT)
      previewServer?.stop()
      serverRef.current = null
      vfsRef.current = null
    }
    // Start once. Subsequent html updates write to the existing VFS below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!html.trim()) {
      return
    }

    const vfs = vfsRef.current

    if (!vfs) {
      return
    }

    vfs.writeFileSync('/index.html', html)
    triggerIndexHtmlReload(serverRef.current)
    console.log('[landing-preview] wrote /index.html to VirtualFS', {
      bytes: html.length,
    })
  }, [html])

  return {
    handlePreviewLoad,
    iframeRef,
    previewUrl,
  }
}

function triggerIndexHtmlReload(server: null | ViteDevServer) {
  const viteServer = server as unknown as null | {
    handleFileChange?: (path: string) => void
  }

  viteServer?.handleFileChange?.('/index.html')
}
