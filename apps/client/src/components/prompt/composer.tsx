import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowUp, MousePointerClick, Paperclip, Square, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, memo, useRef } from 'react'

import type { PromptAttachmentInput } from '../../lib/landing-agent'
import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { ModelDropdown } from './model-dropdown'

export const Composer = memo(function Composer({
  attachmentError,
  attachments,
  disabled,
  elementSelectionActive,
  isStreaming,
  model,
  onAttachFiles,
  onChange,
  onElementSelectionToggle,
  onKeyDown,
  onModelChange,
  onRemoveAttachment,
  onStop,
  onSubmit,
  prompt,
}: {
  attachmentError: null | string
  attachments: PromptAttachmentInput[]
  disabled: boolean
  elementSelectionActive: boolean
  isStreaming: boolean
  model: string
  onAttachFiles: (files: FileList | null) => void
  onChange: (value: string) => void
  onElementSelectionToggle: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onModelChange: (model: string) => void
  onRemoveAttachment: (id: string) => void
  onStop: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  prompt: string
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <form
      className="h-full min-h-0 border-t border-border/70 bg-background/35 p-2"
      onSubmit={onSubmit}
    >
      <div className="flex h-full min-h-0 flex-col rounded-none border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <span className="sr-only" id="landing-prompt-hint">
          Press Enter to send from the prompt. Press Shift and Enter for a new
          line. Press {KEYBOARD_SHORTCUTS.send.title} to send from anywhere.
        </span>
        <Textarea
          aria-describedby="landing-prompt-hint"
          aria-label="Prompt"
          className="min-h-0 flex-1 resize-none border-0 bg-transparent p-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the landing page to build or refine..."
          rows={4}
          value={prompt}
        />
        {attachments.length > 0 || attachmentError ? (
          <div className="flex shrink-0 flex-col gap-1 border-t border-border/60 px-2 py-1.5">
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {attachments.map((attachment) => (
                  <AttachmentChip
                    attachment={attachment}
                    disabled={isStreaming}
                    key={attachment.id}
                    onRemove={onRemoveAttachment}
                  />
                ))}
              </div>
            ) : null}
            {attachmentError ? (
              <p className="text-[11px] leading-relaxed text-destructive">
                {attachmentError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 p-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              multiple
              onChange={(event) => {
                onAttachFiles(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
              ref={fileInputRef}
              type="file"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      aria-label={
                        elementSelectionActive
                          ? 'Cancel element selection'
                          : 'Select element from preview'
                      }
                      aria-pressed={elementSelectionActive}
                      disabled={isStreaming}
                      onClick={onElementSelectionToggle}
                      size="icon-xs"
                      type="button"
                      variant={elementSelectionActive ? 'default' : 'outline'}
                    >
                      <MousePointerClick />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {elementSelectionActive
                    ? 'Cancel element selection'
                    : 'Select element from preview'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      aria-label="Attach image"
                      disabled={isStreaming}
                      onClick={() => fileInputRef.current?.click()}
                      size="icon-xs"
                      type="button"
                      variant="outline"
                    >
                      <Paperclip />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Attach image
                  <span className="ml-2 text-background/80">
                    PNG, JPEG, WEBP, or GIF
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ModelDropdown model={model} onModelChange={onModelChange} />
          </div>
          <div>
            {isStreaming ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        aria-label="Stop generation"
                        onClick={onStop}
                        size="icon-sm"
                        type="button"
                        variant="destructive"
                      >
                        <Square />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Stop generation
                    <KeyboardShortcut
                      className="ml-0 text-background opacity-80"
                      shortcut={KEYBOARD_SHORTCUTS.stop}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        aria-label="Send prompt"
                        className={cn(
                          disabled && 'cursor-not-allowed opacity-60',
                        )}
                        disabled={disabled}
                        size="icon-sm"
                        type="submit"
                      >
                        <ArrowUp />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Send prompt
                    <KeyboardShortcut
                      className="ml-0 text-background opacity-80"
                      shortcut={KEYBOARD_SHORTCUTS.send}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </form>
  )
})

function AttachmentChip({
  attachment,
  disabled,
  onRemove,
}: {
  attachment: PromptAttachmentInput
  disabled: boolean
  onRemove: (id: string) => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 border border-border bg-muted/45 px-1.5 py-0.5 text-[11px] leading-5 text-muted-foreground">
      {attachment.kind === 'element' ? (
        <span className="shrink-0 text-foreground">HTML</span>
      ) : null}
      <span className="truncate text-foreground">{attachment.name}</span>
      <span className="shrink-0">{formatAttachmentSize(attachment.size)}</span>
      <Button
        aria-label={`Remove ${attachment.name}`}
        className="size-5 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={() => onRemove(attachment.id)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X className="size-3" />
      </Button>
    </span>
  )
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`
  const kib = size / 1024
  if (kib < 1024) return `${Math.round(kib)} KB`
  return `${(kib / 1024).toFixed(1)} MB`
}
