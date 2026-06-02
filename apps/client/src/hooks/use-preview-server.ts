import { getServerBridge, VirtualFS, ViteDevServer } from 'almostnode'
import { useCallback, useEffect, useRef, useState } from 'react'

import { INSPECTOR_CONTROL_MESSAGE } from '../lib/inspector-messages'
import { createBridgeServer } from '../lib/preview-bridge'
import { createViteProject, PREVIEW_PORT } from '../lib/preview-project'
import { errorMessage } from '../lib/tool-result'

export type UsePreviewServerOptions = {
  onError: (message: string) => void
}

export function usePreviewServer({ onError }: UsePreviewServerOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const serverRef = useRef<null | ViteDevServer>(null)
  const vfsRef = useRef<null | VirtualFS>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const handlePreviewLoad = useCallback(() => {
    const contentWindow = iframeRef.current?.contentWindow
    const server = serverRef.current

    if (contentWindow && server) {
      server.setHMRTarget(contentWindow)
    }
  }, [])

  const postInspectorEnabled = useCallback((enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        enabled,
        type: INSPECTOR_CONTROL_MESSAGE,
      },
      '*',
    )
  }, [])

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
        onError(errorMessage(caught))
      }
    })

    return () => {
      disposed = true
      bridge.unregisterServer(PREVIEW_PORT)
      previewServer?.stop()
      serverRef.current = null
      vfsRef.current = null
    }
  }, [onError])

  return {
    handlePreviewLoad,
    iframeRef,
    postInspectorEnabled,
    previewUrl,
    vfsRef,
  }
}
