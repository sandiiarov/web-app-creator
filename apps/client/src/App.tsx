import { Button } from '@workspace/ui/components/button'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorBanner } from './components/error-banner'
import { LandingPreview } from './components/landing-preview'
import { PromptPanel } from './components/prompt/prompt-panel'
import { useLandingPage } from './hooks/use-landing-page'

export interface EditorPageProps {
  projectId: string
}

export function EditorPage({ projectId }: EditorPageProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<null | string>(null)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const landing = useLandingPage({
    onError: setErrorMessage,
    projectId,
  })

  if (landing.missing) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">
            This project no longer exists.
          </p>
          <Button
            className="mt-4"
            onClick={() => navigate('/')}
            type="button"
            variant="outline"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to projects
          </Button>
        </div>
      </main>
    )
  }

  const hasLanding = landing.turns.length > 0

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-background"
      data-project-id={projectId}
    >
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
