import { type FormEvent, type RefObject, useState } from 'react'

import type { SelectedElement } from '../lib/agent'
import {
  selectedElementLabel,
  selectionButtonClassName,
} from '../lib/selection'

export type PromptBarProps = {
  editStatus: null | string
  inputRef: RefObject<HTMLInputElement | null>
  isEditing: boolean
  isSelectionMode: boolean
  onSelectionModeChange: (enabled: boolean) => void
  onSubmitPrompt: (prompt: string) => Promise<boolean>
  selectedElement: null | SelectedElement
}

export function PromptBar({
  editStatus,
  inputRef,
  isEditing,
  isSelectionMode,
  onSelectionModeChange,
  onSubmitPrompt,
  selectedElement,
}: PromptBarProps) {
  const [prompt, setPrompt] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (await onSubmitPrompt(prompt)) {
      setPrompt('')
    }
  }

  return (
    <form
      className="fixed inset-x-4 bottom-4 z-10 mx-auto max-w-3xl rounded-3xl border bg-background/90 p-3 shadow-2xl backdrop-blur"
      onSubmit={handleSubmit}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <button
          className={selectionButtonClassName(isSelectionMode)}
          onClick={() => onSelectionModeChange(!isSelectionMode)}
          type="button"
        >
          {selectionButtonText(isSelectionMode)}
          <kbd className="ml-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px]">
            ⌘G
          </kbd>
        </button>
        <span className="min-w-0 flex-1 truncate">
          {selectionHelpText(selectedElement)}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          aria-label="AI edit prompt"
          className="min-w-0 flex-1 rounded-2xl border bg-background px-4 py-3 text-sm transition outline-none focus:border-primary"
          disabled={isEditing}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Make the selected card glassier, change the heading, add a gradient…"
          ref={inputRef}
          type="text"
          value={prompt}
        />
        <button
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={submitDisabled(isEditing, prompt)}
          type="submit"
        >
          {submitButtonText(isEditing)}
        </button>
      </div>
      <PromptStatus editStatus={editStatus} />
    </form>
  )
}

function PromptStatus({ editStatus }: Pick<PromptBarProps, 'editStatus'>) {
  return editStatus ? (
    <p className="mt-2 text-xs text-muted-foreground">{editStatus}</p>
  ) : null
}

function selectionButtonText(isSelectionMode: boolean) {
  return isSelectionMode ? 'Click an element…' : 'Select element'
}

function selectionHelpText(selectedElement: null | SelectedElement) {
  return selectedElement
    ? selectedElementLabel(selectedElement)
    : 'Ask for a change, or select an element first.'
}

function submitButtonText(isEditing: boolean) {
  return isEditing ? 'Applying…' : 'Apply'
}

function submitDisabled(isEditing: boolean, prompt: string) {
  return isEditing || prompt.trim().length === 0
}
