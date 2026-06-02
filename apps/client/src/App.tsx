import { useCallback, useRef, useState } from 'react'

import { ErrorBanner } from './components/error-banner'
import { PreviewFrame } from './components/preview-frame'
import { PromptBar } from './components/prompt-bar'
import { useAgentChat } from './hooks/use-agent-chat'
import { useInspectorSelection } from './hooks/use-inspector-selection'
import { usePreviewServer } from './hooks/use-preview-server'

export function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<null | string>(null)

  const setErrorMessage = useCallback((message: null | string) => {
    setError(message)
  }, [])

  const {
    handlePreviewLoad,
    iframeRef,
    postInspectorEnabled,
    previewUrl,
    vfsRef,
  } = usePreviewServer({
    onError: setErrorMessage,
  })
  const { isSelectionMode, selectedElement, setSelectionMode } =
    useInspectorSelection({
      iframeRef,
      inputRef,
      postInspectorEnabled,
    })
  const { editStatus, isEditing, sendPrompt } = useAgentChat({
    onError: setErrorMessage,
    vfsRef,
  })

  const handleFrameLoad = useCallback(() => {
    handlePreviewLoad()
    postInspectorEnabled(isSelectionMode)
  }, [handlePreviewLoad, isSelectionMode, postInspectorEnabled])

  const handleSubmitPrompt = useCallback(
    (prompt: string) => sendPrompt(prompt, selectedElement),
    [selectedElement, sendPrompt],
  )

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {error ? <ErrorBanner message={error} /> : null}
      <PreviewFrame
        iframeRef={iframeRef}
        onLoad={handleFrameLoad}
        previewUrl={previewUrl}
      />
      <PromptBar
        editStatus={editStatus}
        inputRef={inputRef}
        isEditing={isEditing}
        isSelectionMode={isSelectionMode}
        onSelectionModeChange={setSelectionMode}
        onSubmitPrompt={handleSubmitPrompt}
        selectedElement={selectedElement}
      />
    </main>
  )
}
