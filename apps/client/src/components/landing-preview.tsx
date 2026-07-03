import { preparePreviewSrcDoc } from '../lib/preview-srcdoc'

export type LandingPreviewProps = {
  html: string
  onError?: (message: string) => void
}

export function LandingPreview({ html }: LandingPreviewProps) {
  if (!html.trim()) {
    return <LandingEmptyState />
  }

  return (
    <iframe
      className="h-svh w-screen border-0"
      referrerPolicy="no-referrer"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      srcDoc={preparePreviewSrcDoc(html)}
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
