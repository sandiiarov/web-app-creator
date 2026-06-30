import { Bubble, BubbleContent } from '@workspace/ui/components/bubble'
import { Message, MessageContent } from '@workspace/ui/components/message'

import type {
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
              {turn.prompt}
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
