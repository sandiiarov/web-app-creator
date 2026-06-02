import type { RefObject } from 'react'

export type PreviewFrameProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>
  onLoad: () => void
  previewUrl: string
}

export function PreviewFrame({
  iframeRef,
  onLoad,
  previewUrl,
}: PreviewFrameProps) {
  return (
    <iframe
      className="h-svh w-screen border-0"
      onLoad={onLoad}
      ref={iframeRef}
      sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
      src={previewUrl || 'about:blank'}
      title="Browser Vite preview"
    />
  )
}
