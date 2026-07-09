import { LandingPreview } from '@workspace/landing-preview'
import {
  type ElementAttachmentInput,
  type PanelLayout,
  PANEL_WIDTH,
  PromptPanel,
  readStoredPanelLayout,
} from '@workspace/prompt-panel'
import { Button } from '@workspace/ui/components/button'
import { ArrowLeft } from 'lucide-react'
import { type CSSProperties, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useTheme } from '#components/theme-provider'

import { ErrorBanner } from './components/error-banner'
import { useLandingPage } from './hooks/use-landing-page'
import { downloadProjectHtml } from './lib/projects-api'

export interface EditorPageProps {
  projectId: string
}

export function EditorPage({ projectId }: EditorPageProps) {
  const navigate = useNavigate()
  const { setTheme, theme } = useTheme()
  const [error, setError] = useState<null | string>(null)
  const [elementSelectionActive, setElementSelectionActive] = useState(false)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(
    readStoredPanelLayout,
  )
  const [selectedElementAttachment, setSelectedElementAttachment] =
    useState<ElementAttachmentInput | null>(null)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const handlePanelLayoutChange = useCallback(
    (layout: PanelLayout) => setPanelLayout(layout),
    [],
  )

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

  const previewClassName =
    panelLayout === 'left-sidebar'
      ? 'h-svh w-[calc(100vw-var(--landing-panel-width))] border-0 ml-[var(--landing-panel-width)]'
      : panelLayout === 'right-sidebar'
        ? 'h-svh w-[calc(100vw-var(--landing-panel-width))] border-0 mr-[var(--landing-panel-width)]'
        : 'h-svh w-screen border-0'

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-background"
      data-project-id={projectId}
      style={{ '--landing-panel-width': `${PANEL_WIDTH}px` } as CSSProperties}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <LandingPreview
        elementSelectionActive={elementSelectionActive}
        html={landing.html}
        iframeClassName={previewClassName}
        onElementSelected={handleElementSelected}
        onElementSelectionCancel={handleElementSelectionCancel}
        onError={setErrorMessage}
      />
      <PromptPanel
        canDownload={!!landing.html}
        elementSelectionActive={elementSelectionActive}
        isStreaming={landing.isStreaming}
        models={landing.models}
        onAllProjects={() => navigate('/')}
        onDownloadHtml={() => downloadProjectHtml(projectId)}
        onElementSelectionToggle={handleElementSelectionToggle}
        onLayoutChange={handlePanelLayoutChange}
        onModelsChange={landing.setModels}
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
