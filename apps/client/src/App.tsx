import { isStarterPreview } from '@workspace/landing-preview'
import { LandingPreview } from '@workspace/landing-preview/react'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  type ElementAttachmentInput,
  type LandingTurn,
  type PanelLayout,
  type PreviewViewport,
  PromptPanel,
  readStoredPanelLayout,
} from '@workspace/prompt-panel'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useTheme } from '#components/theme-provider'

import { EditorPageActions } from './components/editor-page-actions'
import { ErrorBanner } from './components/error-banner'
import { ProjectSwitcher } from './components/project-switcher'
import { RenameProjectDialog } from './components/rename-project-dialog'
import { useLandingPage } from './hooks/use-landing-page'
import { useModelPricing } from './hooks/use-model-pricing'
import { useProjectDraft } from './hooks/use-project-draft'
import { loadDraft } from './lib/project-drafts'
import { downloadProjectHtml } from './lib/projects-api'

// Vite's accept() marks a boundary; it does not opt a React subtree out of
// Fast Refresh. Keep this exported component identity stable and swap only its
// render function so React reconciles the editor without remounting the iframe.
type EditorPageHotState = {
  component?: (props: EditorPageProps) => ReactNode
  render: (props: EditorPageProps) => ReactNode
  rerender?: () => void
}

interface EditorPageProps {
  projectId: string
}

function useEditorPageProxy(props: EditorPageProps) {
  const [, setRevision] = useState(0)

  useEffect(() => {
    const rerender = () => setRevision((revision) => revision + 1)
    editorPageHotState.rerender = rerender
    return () => {
      if (editorPageHotState.rerender === rerender) {
        editorPageHotState.rerender = undefined
      }
    }
  }, [])

  return editorPageHotState.render(props)
}

function useEditorPageRender({ projectId }: EditorPageProps) {
  const navigate = useNavigate()
  const { setTheme, theme } = useTheme()
  const [error, setError] = useState<null | string>(null)
  const draft = useProjectDraft(projectId)
  const [renaming, setRenaming] = useState(false)
  const [locateElement, setLocateElement] = useState<{
    nonce: number
    selector: string
  }>()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<null | string>(null)
  const [refreshed, setRefreshed] = useState(false)
  const [elementSelectionActive, setElementSelectionActive] = useState(false)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(
    readStoredPanelLayout,
  )
  const [viewport, setViewport] = useState<PreviewViewport>(
    DEFAULT_PREVIEW_VIEWPORT,
  )
  const [selectedElementAttachment, setSelectedElementAttachment] =
    useState<ElementAttachmentInput | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const handlePanelLayoutChange = useCallback(
    (layout: PanelLayout) => setPanelLayout(layout),
    [],
  )

  const handleReloadPreview = useCallback(() => {
    setReloadToken((token) => token + 1)
    setRefreshed(true)
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
  useEffect(() => {
    if (!refreshed) return
    const timer = setTimeout(() => setRefreshed(false), 1400)
    return () => clearTimeout(timer)
  }, [refreshed, reloadToken])
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await downloadProjectHtml(projectId)
    } catch (failure) {
      setExportError(
        failure instanceof Error ? failure.message : 'Could not download HTML',
      )
    } finally {
      setExporting(false)
    }
  }
  const handleRetryTurn = async (turn: LandingTurn) => {
    try {
      const saved = await loadDraft(`${projectId}:turn:${turn.id}`)
      const fallback = {
        attachments: (turn.attachments ?? []).filter(
          (attachment): attachment is ElementAttachmentInput =>
            attachment.kind === 'element',
        ),
        prompt: turn.prompt,
      }
      const next = saved.prompt ? saved : fallback
      if (
        !saved.prompt &&
        (turn.attachments ?? []).some(
          (attachment) => attachment.kind !== 'element',
        )
      )
        setError(
          'This older request has no local image copy. Reattach its images before sending.',
        )
      if (
        (draft.draft.prompt.trim() || draft.draft.attachments.length) &&
        draft.draft.prompt !== next.prompt &&
        !window.confirm('Replace your current draft with this request?')
      )
        return
      draft.update(next)
      document.querySelector<HTMLTextAreaElement>('#landing-prompt')?.focus()
    } catch {
      setError(
        'Could not restore the request. Your current draft is unchanged.',
      )
    }
  }
  const modelPricing = useModelPricing()
  const previewHtml = isStarterPreview(landing.html) ? '' : landing.html

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

  const previewAreaClassName = cn(
    panelLayout === 'left-sidebar'
      ? 'ml-(--landing-panel-width) w-[calc(100vw-var(--landing-panel-width))]'
      : panelLayout === 'right-sidebar'
        ? 'mr-(--landing-panel-width) w-[calc(100vw-var(--landing-panel-width))]'
        : 'w-screen',
    'editor-canvas flex h-svh flex-col',
  )

  const previewFrameClassName = cn(
    'preview-frame h-full border-0',
    viewport === 'mobile'
      ? 'w-97.5 shrink-0'
      : viewport === 'tablet'
        ? 'w-3xl shrink-0'
        : 'w-full',
  )

  return (
    <main
      className="workspace-surface fixed inset-0 overflow-hidden"
      data-project-id={projectId}
      data-viewport={viewport}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className={previewAreaClassName} data-landing-preview-area="">
        <div className="preview-stage">
          <LandingPreview
            elementSelectionActive={elementSelectionActive}
            html={previewHtml}
            iframeClassName={previewFrameClassName}
            locateElement={locateElement}
            onElementSelected={handleElementSelected}
            onElementSelectionCancel={handleElementSelectionCancel}
            onError={setErrorMessage}
            reloadToken={reloadToken}
          />
        </div>
      </div>
      {renaming ? (
        <RenameProjectDialog
          onClose={() => setRenaming(false)}
          onSaved={(project) => landing.setTitle(project.title)}
          project={{ id: projectId, title: landing.title }}
        />
      ) : null}
      <PromptPanel
        canSelectElement={!!previewHtml}
        connection={landing.connection}
        draft={draft.draft}
        draftError={draft.error}
        draftReady={draft.ready}
        elementSelectionActive={elementSelectionActive}
        isStopping={landing.isStopping}
        isStreaming={landing.isStreaming}
        modelPricing={modelPricing}
        models={landing.models}
        onAllProjects={() => navigate('/')}
        onDraftChange={draft.update}
        onElementSelectionToggle={handleElementSelectionToggle}
        onLayoutChange={handlePanelLayoutChange}
        onLocateElement={(selector) =>
          setLocateElement({ nonce: Date.now(), selector })
        }
        onModelsChange={landing.setModels}
        onReconnect={landing.reconnect}
        onRetryTurn={handleRetryTurn}
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
        pageActions={
          <EditorPageActions
            canDownload={!!previewHtml}
            exportError={exportError}
            exporting={exporting}
            onDownloadHtml={handleExport}
            onReloadPreview={handleReloadPreview}
            onRename={() => setRenaming(true)}
            onViewportChange={setViewport}
            refreshed={refreshed}
            viewport={viewport}
          />
        }
        projectSwitcher={<ProjectSwitcher currentProjectId={projectId} />}
        projectTitle={landing.title}
        selectedElementAttachment={selectedElementAttachment}
        theme={theme}
        turns={landing.turns}
      />
    </main>
  )
}

const editorPageHotState: EditorPageHotState = (import.meta.hot?.data
  .editorPage as EditorPageHotState | undefined) ?? {
  render: useEditorPageRender,
}
editorPageHotState.render = useEditorPageRender
if (import.meta.hot) import.meta.hot.data.editorPage = editorPageHotState
editorPageHotState.component ??= useEditorPageProxy

export const EditorPage = editorPageHotState.component

if (import.meta.hot) {
  import.meta.hot.accept(() => editorPageHotState.rerender?.())
}
