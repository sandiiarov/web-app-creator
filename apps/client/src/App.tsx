import { Button } from '@workspace/ui/components/button'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorBanner } from './components/error-banner'
import { LandingPreview } from './components/landing-preview'
import { PromptPanel } from './components/prompt/prompt-panel'
import { useLandingPage } from './hooks/use-landing-page'
import {
  ProjectNotFoundError,
  expandProjectImageUrls,
  getProject,
  updateProject,
} from './lib/projects-api'

const AUTOSAVE_DEBOUNCE_MS = 600
const TITLE_MAX = 60

export interface EditorPageProps {
  projectId: string
}

export function EditorPage({ projectId }: EditorPageProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<null | string>(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('Untitled')

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const landing = useLandingPage({
    onError: setErrorMessage,
  })

  // Track the html we seeded from the loaded project so we don't autosave it
  // straight back (the server already has it).
  const loadedHtmlRef = useRef('')
  const savingRef = useRef<null | Promise<void>>(null)

  // Load the project on mount (and when switching projects): seed html + model.
  useEffect(() => {
    let cancelled = false
    loadedHtmlRef.current = ''
    setMissing(false)

    void getProject(projectId)
      .then((project) => {
        if (cancelled) return
        const expanded = expandProjectImageUrls(project.indexHtml)
        loadedHtmlRef.current = expanded
        setTitle(project.title || 'Untitled')
        landing.setHtml(expanded)
        if (project.model) landing.setModel(project.model)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ProjectNotFoundError) {
          setMissing(true)
        } else {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load project')
        }
      })

    return () => {
      cancelled = true
    }
    // Seed once per project; subsequent edits flow through autosave below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Derive the title from the first prompt once there is conversation history.
  useEffect(() => {
    const firstPrompt = landing.turns[0]?.prompt
    if (firstPrompt) setTitle(truncateTitle(firstPrompt))
  }, [landing.turns])

  // Autosave: debounced PUT on html change + a final flush when streaming ends.
  useEffect(() => {
    const html = landing.html
    if (!html.trim()) return
    if (html === loadedHtmlRef.current) return

    const timer = window.setTimeout(() => {
      loadedHtmlRef.current = html
      void saveProject(projectId, html, landing.model, title, savingRef, setErrorMessage)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [landing.html, landing.model, projectId, setErrorMessage, title])

  useEffect(() => {
    if (landing.isStreaming) return
    if (!landing.html.trim()) return
    if (landing.html === loadedHtmlRef.current) return
    loadedHtmlRef.current = landing.html
    void saveProject(projectId, landing.html, landing.model, title, savingRef, setErrorMessage)
  }, [landing.isStreaming, landing.html, landing.model, projectId, setErrorMessage, title])

  if (missing) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">This project no longer exists.</p>
          <Button className="mt-4" onClick={() => navigate('/')} type="button" variant="outline">
            <ArrowLeft data-icon="inline-start" />
            Back to projects
          </Button>
        </div>
      </main>
    )
  }

  const hasLanding = landing.turns.length > 0

  return (
    <main className="fixed inset-0 overflow-hidden bg-background" data-project-id={projectId}>
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

async function saveProject(
  projectId: string,
  html: string,
  model: string,
  title: string,
  savingRef: React.RefObject<null | Promise<void>>,
  onError: (message: string) => void,
) {
  try {
    // Serialize saves so a debounce flush never races a final flush.
    const previous = savingRef.current ?? Promise.resolve()
    const next = previous
      .then(() => updateProject(projectId, { indexHtml: html, model, title }))
      .then(() => undefined)
    savingRef.current = next
    await next
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Failed to save project')
  } finally {
    savingRef.current = null
  }
}

function truncateTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ')
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX)}…` : trimmed
}
