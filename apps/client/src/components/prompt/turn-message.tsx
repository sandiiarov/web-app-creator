import { Bubble, BubbleContent } from '@workspace/ui/components/bubble'
import { Message, MessageContent } from '@workspace/ui/components/message'

import type {
  ImageAttachmentMeta,
  LandingTurn,
  ToolCallPart,
  TurnPart,
} from '../../lib/landing-agent'
import { StreamdownContent } from './streamdown-content'
import { TurnMetadata } from './turn-metadata'
import { TurnSteps } from './turn-steps'

export function TurnMessage({ turn }: { turn: LandingTurn }) {
  // Group consecutive tool_call parts into single TurnSteps blocks so the
  // bordered container appears once per cluster, not once per call.
  const groups: Array<ToolCallPart[] | TurnPart> = []
  for (const part of turn.parts) {
    const last = groups[groups.length - 1]
    if (part.type === 'tool_call') {
      if (Array.isArray(last)) {
        last.push(part)
      } else {
        groups.push([part])
      }
    } else {
      groups.push(part)
    }
  }

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

      {groups.map((group, index) => (
        <GroupView
          group={group}
          isStreaming={turn.isStreaming}
          key={`${turn.id}-${index}`}
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

function AttachmentPill({ attachment }: { attachment: ImageAttachmentMeta }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 border border-current/20 bg-background/15 px-1.5 py-0.5 text-[11px] leading-5">
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

function GroupView({
  group,
  isStreaming,
}: {
  group: ToolCallPart[] | TurnPart
  isStreaming: boolean
}) {
  if (Array.isArray(group)) {
    return <TurnSteps steps={group} />
  }
  return <PartView isStreaming={isStreaming} part={group} />
}

function PartView({
  isStreaming,
  part,
}: {
  isStreaming: boolean
  part: TurnPart
}) {
  switch (part.type) {
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
      return (
        <div className="px-1">
          <StreamdownContent isStreaming={isStreaming} variant="thinking">
            {part.text.trim()}
          </StreamdownContent>
        </div>
      )
    }
    default:
      return null
  }
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
