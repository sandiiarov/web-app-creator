import { type RefObject, useCallback, useEffect, useState } from 'react'

import type { SelectedElement } from '../lib/agent'
import {
  isInspectorSelectionMessage,
  isInspectorShortcutMessage,
} from '../lib/inspector-messages'

export type UseInspectorSelectionOptions = {
  iframeRef: RefObject<HTMLIFrameElement | null>
  inputRef: RefObject<HTMLInputElement | null>
  postInspectorEnabled: (enabled: boolean) => void
}

type InspectorMessageActions = {
  data: unknown
  focusPrompt: () => void
  setSelectedElement: (element: SelectedElement) => void
  setSelectionMode: (enabled: boolean) => void
}

export function useInspectorSelection({
  iframeRef,
  inputRef,
  postInspectorEnabled,
}: UseInspectorSelectionOptions) {
  const [isSelectionMode, setIsSelectionModeState] = useState(false)
  const [selectedElement, setSelectedElement] =
    useState<null | SelectedElement>(null)

  const focusPrompt = useCallback(() => {
    inputRef.current?.focus()
  }, [inputRef])

  const setSelectionMode = useCallback(
    (enabled: boolean) => {
      setIsSelectionModeState(enabled)
      postInspectorEnabled(enabled)
    },
    [postInspectorEnabled],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        setSelectionMode(true)
        focusPrompt()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusPrompt, setSelectionMode])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isPreviewFrameMessage(event, iframeRef)) {
        return
      }

      handleInspectorMessage({
        data: event.data,
        focusPrompt,
        setSelectedElement,
        setSelectionMode,
      })
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [iframeRef, focusPrompt, setSelectionMode])

  return {
    isSelectionMode,
    selectedElement,
    setSelectionMode,
  }
}

function handleInspectorMessage({
  data,
  focusPrompt,
  setSelectedElement,
  setSelectionMode,
}: InspectorMessageActions) {
  if (isInspectorShortcutMessage(data)) {
    setSelectionMode(true)
    focusPrompt()
    return
  }

  if (isInspectorSelectionMessage(data)) {
    setSelectedElement(data.payload)
    setSelectionMode(false)
    focusPrompt()
  }
}

function isPreviewFrameMessage(
  event: MessageEvent,
  iframeRef: RefObject<HTMLIFrameElement | null>,
) {
  return event.source === iframeRef.current?.contentWindow
}
