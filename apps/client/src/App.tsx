import { useCallback, useState } from 'react'

import { ErrorBanner } from './components/error-banner'
import { LandingPreview } from './components/landing-preview'
import { PromptPanel } from './components/prompt/prompt-panel'
import { useLandingPage } from './hooks/use-landing-page'

export function App() {
  const [error, setError] = useState<null | string>(null)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const landing = useLandingPage({
    onError: setErrorMessage,
  })

  const hasLanding = landing.turns.length > 0

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {error ? <ErrorBanner message={error} /> : null}
      <LandingPreview html={landing.html} onError={setErrorMessage} />
      <PromptPanel
        isStreaming={landing.isStreaming}
        model={landing.model}
        onModelChange={landing.setModel}
        onSend={landing.send}
        onStop={landing.stop}
        turns={landing.turns}
      />
      {!hasLanding ? (
        <p className="pointer-events-none fixed bottom-4 left-4 z-20 max-w-xs rounded-none border border-border bg-popover/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          Drag the panel. Describe a landing page to begin.
        </p>
      ) : null}
    </main>
  )
}
