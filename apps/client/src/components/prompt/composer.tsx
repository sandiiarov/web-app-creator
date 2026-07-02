import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowUp, Square } from 'lucide-react'
import { type FormEvent, type KeyboardEvent } from 'react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { ModelDropdown } from './model-dropdown'

export function Composer({
  disabled,
  isStreaming,
  model,
  onChange,
  onKeyDown,
  onModelChange,
  onStop,
  onSubmit,
  prompt,
}: {
  disabled: boolean
  isStreaming: boolean
  model: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onModelChange: (model: string) => void
  onStop: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  prompt: string
}) {
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
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 p-2">
          <ModelDropdown model={model} onModelChange={onModelChange} />
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
}
