import { PromptPanel } from '@workspace/prompt-panel'
import { Button } from '@workspace/ui/components/button'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useTheme } from '#components/theme-provider'

import { ErrorBanner } from './components/error-banner'
import { LandingPreview } from './components/landing-preview'
import { useLandingPage } from './hooks/use-landing-page'
import type { ElementAttachmentInput } from './lib/landing-agent'

export interface EditorPageProps {
  projectId: string
}

export function EditorPage({ projectId }: EditorPageProps) {
  const navigate = useNavigate()
  const { setTheme, theme } = useTheme()
  const [error, setError] = useState<null | string>(null)
  const [elementSelectionActive, setElementSelectionActive] = useState(false)
  const [selectedElementAttachment, setSelectedElementAttachment] =
    useState<ElementAttachmentInput | null>(null)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const handleElementSelectionCancel = useCallback(() => {
    setElementSelectionActive(false)
  }, [])

  const handleElementSelectionToggle = useCallback(() => {
    setElementSelectionActive((active) => !active)
  }, [])

  const handleElementSelected = useCallback(
    (attachment: ElementAttachmentInput) => {
      setSelectedElementAttachment(attachment)
      setElementSelectionActive(false)
    },
    [],
  )

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
      <LandingPreview
        elementSelectionActive={elementSelectionActive}
        html={landing.html}
        onElementSelected={handleElementSelected}
        onElementSelectionCancel={handleElementSelectionCancel}
        onError={setErrorMessage}
      />
      <PromptPanel
        elementSelectionActive={elementSelectionActive}
        isStreaming={landing.isStreaming}
        model={landing.model}
        onAllProjects={() => navigate('/')}
        onElementSelectionToggle={handleElementSelectionToggle}
        onModelChange={landing.setModel}
        onSelectedElementAttachmentConsumed={() =>
          setSelectedElementAttachment(null)
        }
        onSend={landing.send}
        onStop={landing.stop}
        onToggleTheme={() =>
          setTheme(
            document.documentElement.classList.contains('dark')
              ? 'light'
              : 'dark',
          )
        }
        selectedElementAttachment={selectedElementAttachment}
        theme={theme}
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
