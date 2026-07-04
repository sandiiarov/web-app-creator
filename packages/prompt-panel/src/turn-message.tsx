import { Bubble, BubbleContent } from '@workspace/ui/components/bubble'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@workspace/ui/components/marker'
import { Message, MessageContent } from '@workspace/ui/components/message'
import { Separator } from '@workspace/ui/components/separator'
import { cn } from '@workspace/ui/lib/utils'
import { Brain, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  formatRetryDelay,
  type LandingTurn,
  type PromptAttachmentMeta,
  type RetryPart,
  type ThinkingPart,
  type TurnPart,
} from './domain'
import { StreamdownContent } from './streamdown-content'
import { TurnMetadata } from './turn-metadata'
import { TurnToolBlock } from './turn-steps'

export function TurnMessage({ turn }: { turn: LandingTurn }) {
  return (
    <div className="flex flex-col gap-2">
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent className="wrap-break-word whitespace-pre-wrap">
              <UserPrompt turn={turn} />
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>

      {turn.parts.map((part, index) => (
        <PartView
          isStreaming={turn.isStreaming && index === turn.parts.length - 1}
          key={`${turn.id}-${index}`}
          part={part}
        />
      ))}

      {turn.error ? (
        <Message>
          <MessageContent>
            <Bubble variant="destructive">
              <BubbleContent className="wrap-break-word whitespace-pre-wrap">
                {turn.error}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : null}
    </div>
  )
}

function AttachmentPill({ attachment }: { attachment: PromptAttachmentMeta }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 border border-current/20 bg-background/15 px-1.5 py-0.5 text-[11px] leading-5">
      {attachment.kind === 'element' ? <span>HTML</span> : null}
      <span className="truncate">{attachment.name}</span>
      <span className="opacity-75">
        {formatAttachmentSize(attachment.size)}
      </span>
    </span>
  )
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`
  const kib = size / 1024
  if (kib < 1024) return `${Math.round(kib)} KB`
  return `${(kib / 1024).toFixed(1)} MB`
}

function PartView({
  isStreaming,
  part,
}: {
  isStreaming: boolean
  part: TurnPart
}) {
  switch (part.type) {
    case 'retry': {
      return <RetryNotice isStreaming={isStreaming} retry={part} />
    }
    case 'stats': {
      return <TurnMetadata stats={part} />
    }
    case 'text': {
      if (!part.text.trim()) return null
      return (
        <Message>
          <MessageContent>
            <Bubble variant="ghost">
              <BubbleContent>
                <StreamdownContent isStreaming={isStreaming}>
                  {part.text}
                </StreamdownContent>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    }
    case 'thinking': {
      if (!part.text.trim()) return null
      return <ThinkingBlock isStreaming={isStreaming} thinking={part} />
    }
    case 'tool_call': {
      return <TurnToolBlock step={part} />
    }
    default:
      return null
  }
}

function RetryNotice({
  isStreaming,
  retry,
}: {
  isStreaming: boolean
  retry: RetryPart
}) {
  const [now, setNow] = useState(() => Date.now())
  const endAt = retry.startedAt + retry.delayMs
  const remainingMs = Math.max(0, endAt - now)
  const elapsedMs = Math.min(retry.delayMs, Math.max(0, now - retry.startedAt))
  const progress = retry.delayMs > 0 ? (elapsedMs / retry.delayMs) * 100 : 100

  useEffect(() => {
    setNow(Date.now())
    if (retry.delayMs <= 0) return

    const interval = window.setInterval(() => setNow(Date.now()), 100)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setNow(Date.now())
    }, retry.delayMs + 150)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [retry.delayMs, retry.startedAt])

  return (
    <div className="border border-amber-500/45 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed shadow-[inset_3px_0_0_rgb(245_158_11/0.75)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-foreground">Model retry</span>
        <span className="font-mono text-amber-700 tabular-nums dark:text-amber-300">
          {remainingMs > 0
            ? `Retrying in ${formatRetryDelay(remainingMs)}`
            : isStreaming
              ? 'Retrying now'
              : 'Retry sent'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-muted-foreground">
        <span>
          Attempt {retry.attempt}/{retry.maxAttempts}
        </span>
        <span aria-hidden="true">·</span>
        <span>{retry.reason}</span>
      </div>
      <div className="mt-1 wrap-break-word text-foreground/85">
        {retry.issue}
      </div>
      <div className="mt-2 h-1 border border-amber-500/25 bg-background/70">
        <div
          className="h-full bg-amber-500 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function ThinkingBlock({
  isStreaming,
  thinking,
}: {
  isStreaming: boolean
  thinking: ThinkingPart
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible
      className={cn(
        'overflow-hidden rounded-none border bg-background/50',
        isStreaming
          ? 'border-amber-500/45 bg-amber-500/10'
          : 'border-border/70 bg-muted/10',
      )}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger asChild>
        <Marker
          asChild
          className="min-h-10 px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          <button
            aria-label={`${open ? 'Hide' : 'Show'} thinking details`}
            type="button"
          >
            <MarkerIcon
              className={cn(
                'text-muted-foreground transition-colors',
                isStreaming && 'text-amber-700 dark:text-amber-300',
              )}
            >
              <Brain />
            </MarkerIcon>
            <MarkerContent className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-left text-xs leading-snug font-medium text-foreground">
                Thinking
              </span>
              <span className="sr-only">
                {isStreaming ? 'Thinking in progress' : 'Thinking complete'}
              </span>
            </MarkerContent>
            <span
              aria-hidden="true"
              className={cn(
                'ml-auto inline-flex shrink-0 items-center text-muted-foreground transition-colors',
                isStreaming && 'text-amber-700 dark:text-amber-300',
              )}
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform',
                  open && 'rotate-90',
                )}
              />
            </span>
          </button>
        </Marker>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator />
        <div className="p-2">
          <StreamdownContent
            className="text-xs"
            isStreaming={isStreaming}
            variant="thinking"
          >
            {thinking.text.trim()}
          </StreamdownContent>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function UserPrompt({ turn }: { turn: LandingTurn }) {
  const attachments = turn.attachments ?? []

  return (
    <span className="flex flex-col gap-2">
      {turn.prompt ? <span>{turn.prompt}</span> : null}
      {attachments.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {attachments.map((attachment) => (
            <AttachmentPill attachment={attachment} key={attachment.id} />
          ))}
        </span>
      ) : null}
    </span>
  )
}
