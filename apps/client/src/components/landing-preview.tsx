import { useEffect, useRef, useState } from 'react'

import {
  morphPreviewDocument,
  preparePreviewMorphHtml,
  shouldReloadForScriptChange,
} from '../lib/preview-morph'

export type LandingPreviewProps = {
  html: string
  onError?: (message: string) => void
}

export function LandingPreview({ html }: LandingPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastAppliedHtmlRef = useRef('')
  const [srcDoc, setSrcDoc] = useState('')

  useEffect(() => {
    if (!html.trim()) {
      lastAppliedHtmlRef.current = ''
      setSrcDoc('')
      return
    }

    function reloadPreview() {
      lastAppliedHtmlRef.current = html
      setSrcDoc(preparePreviewMorphHtml(html))
    }

    const previousHtml = lastAppliedHtmlRef.current
    if (!previousHtml) {
      reloadPreview()
      return
    }
    if (previousHtml === html) return

    const doc = iframeRef.current?.contentDocument
    if (
      !doc?.documentElement ||
      doc.readyState === 'loading' ||
      shouldReloadForScriptChange(previousHtml, html)
    ) {
      reloadPreview()
      return
    }

    try {
      morphPreviewDocument(doc, html)
      lastAppliedHtmlRef.current = html
    } catch {
      reloadPreview()
    }
  }, [html])

  if (!html.trim()) {
    return <LandingEmptyState />
  }

  return (
    <iframe
      className="h-svh w-screen border-0"
      ref={iframeRef}
      referrerPolicy="no-referrer"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      srcDoc={srcDoc}
      title="Landing page preview"
    />
  )
}

function LandingEmptyState() {
  return (
    <div className="grid h-svh w-screen place-items-center bg-muted/40 text-center">
      <div className="max-w-md px-6">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 grid size-12 place-items-center rounded-none border bg-background text-lg shadow-sm"
        >
          ▲
        </div>
        <h2 className="text-lg font-semibold">Landing page preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a landing page below to generate a single-file HTML preview.
          Paste reference URLs to scrape a brand first.
        </p>
      </div>
    </div>
  )
}
