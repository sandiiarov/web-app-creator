import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@workspace/ui/components/dialog'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowUp, MousePointerClick, Paperclip, Square, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, memo, useRef } from 'react'

import type {
  LandingModelPricing,
  LandingModels,
  LandingTurn,
  PromptAttachmentInput,
} from './domain'
import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { ModelDropdown } from './model-dropdown'
import { SpendPopover } from './spend-popover'

export const Composer = memo(function Composer({
  attachmentError,
  attachments,
  canSelectElement,
  disabled,
  elementSelectionActive,
  isStopping,
  isStreaming,
  modelPricing,
  models,
  onAttachFiles,
  onChange,
  onElementSelectionToggle,
  onKeyDown,
  onLocateElement,
  onModelsChange,
  onRemoveAttachment,
  onStop,
  onSubmit,
  prompt,
  readOnly,
  turns,
}: {
  attachmentError: null | string
  attachments: PromptAttachmentInput[]
  canSelectElement: boolean
  disabled: boolean
  elementSelectionActive: boolean
  isStopping: boolean
  isStreaming: boolean
  modelPricing?: Record<string, LandingModelPricing>
  models: LandingModels
  onAttachFiles: (files: FileList | null) => void
  onChange: (value: string) => void
  onElementSelectionToggle: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onLocateElement: (selector: string) => void
  onModelsChange: (models: LandingModels) => void
  onRemoveAttachment: (id: string) => void
  onStop: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  prompt: string
  readOnly: boolean
  turns: LandingTurn[]
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <form
      className="glass-composer"
      data-streaming={isStreaming}
      onSubmit={onSubmit}
    >
      <div className="composer-input">
        <span className="sr-only" id="landing-prompt-hint">
          Press Enter to send from the prompt. Press Shift and Enter for a new
          line. Press {KEYBOARD_SHORTCUTS.send.title} to send from anywhere.
        </span>
        <label className="sr-only" htmlFor="landing-prompt">
          Ask for a change
        </label>
        <Textarea
          aria-describedby="landing-prompt-hint"
          aria-label="Prompt"
          className="resize-none border-0 bg-transparent text-sm leading-relaxed shadow-none focus-visible:ring-0"
          id="landing-prompt"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask for a change…"
          readOnly={readOnly}
          rows={2}
          value={prompt}
        />
        {attachments.length > 0 || attachmentError ? (
          <div className="composer-attachments flex min-h-0 shrink flex-col gap-1 overflow-y-auto border-t border-border/60 px-2 py-1.5">
            {attachmentError ? (
              <p
                className="text-xs leading-relaxed text-destructive"
                role="alert"
              >
                {attachmentError}
              </p>
            ) : null}
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {attachments.map((attachment) => (
                  <AttachmentChip
                    attachment={attachment}
                    disabled={readOnly}
                    key={attachment.id}
                    onLocate={onLocateElement}
                    onRemove={onRemoveAttachment}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="composer-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2 p-2">
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
                    disabled={readOnly || !canSelectElement}
                    onClick={onElementSelectionToggle}
                    size="icon-xs"
                    type="button"
                    variant={elementSelectionActive ? 'default' : 'ghost'}
                  >
                    <MousePointerClick />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {!canSelectElement
                  ? 'Build a page first to select an element'
                  : elementSelectionActive
                    ? 'Cancel element selection'
                    : 'Select element from preview'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    aria-label="Attach image"
                    disabled={readOnly}
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
                <span className="ml-2 text-popover-foreground/60">
                  PNG, JPEG, WEBP, or GIF
                </span>
              </TooltipContent>
            </Tooltip>
            <ModelDropdown
              modelPricing={modelPricing}
              models={models}
              onModelsChange={onModelsChange}
            />
            <SpendPopover turns={turns} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      aria-label={
                        isStopping ? 'Stopping generation' : 'Stop generation'
                      }
                      disabled={isStopping}
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
                    className="ml-0 text-popover-foreground/60"
                    shortcut={KEYBOARD_SHORTCUTS.stop}
                  />
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      aria-label="Send prompt"
                      className={cn(
                        'composer-send',
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
                    className="ml-0 text-popover-foreground/60"
                    shortcut={KEYBOARD_SHORTCUTS.send}
                  />
                </TooltipContent>
              </Tooltip>
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
  onLocate,
  onRemove,
}: {
  attachment: PromptAttachmentInput
  disabled: boolean
  onLocate: (selector: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <span className="inline-flex w-full min-w-0 items-center gap-1 rounded-lg border border-border bg-muted/45 px-1.5 py-0.5 text-xs leading-5 text-muted-foreground">
      {attachment.kind === 'element' ? (
        <Button
          aria-label={`Locate ${attachment.name} on page`}
          className="min-w-0 flex-1 justify-start px-1"
          onClick={() => onLocate(attachment.selector)}
          size="xs"
          title={`Locate on page: ${attachment.selector}`}
          type="button"
          variant="ghost"
        >
          <MousePointerClick className="size-3 shrink-0" />
          <span className="truncate">{attachment.name}</span>
        </Button>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <button
              aria-label={`Preview ${attachment.name}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              type="button"
            >
              <img
                alt=""
                className="size-8 shrink-0 rounded-sm object-cover"
                src={attachment.dataUrl}
              />
              <span className="min-w-0">
                <span className="block truncate text-foreground">
                  {attachment.name}
                </span>
                <span className="block text-xs">
                  {formatAttachmentSize(attachment.size)}
                </span>
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="break-all">{attachment.name}</DialogTitle>
              <DialogDescription>
                Attached reference · {formatAttachmentSize(attachment.size)}
              </DialogDescription>
            </DialogHeader>
            <img
              alt={attachment.name}
              className="max-h-[70dvh] w-full object-contain"
              src={attachment.dataUrl}
            />
          </DialogContent>
        </Dialog>
      )}
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
