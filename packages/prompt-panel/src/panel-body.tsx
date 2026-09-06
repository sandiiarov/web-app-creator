import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@workspace/ui/components/message-scroller'
import { memo } from 'react'

import { ChatEmptyState } from './chat-empty-state'
import type { LandingTurn } from './domain'
import { TurnMessage } from './turn-message'

export const PanelBody = memo(function PanelBody({
  isStreaming,
  onRetryTurn,
  onSuggestion,
  retryDisabled,
  turns,
}: {
  isStreaming: boolean
  onRetryTurn: (turn: LandingTurn) => void
  onSuggestion: (prompt: string) => void
  retryDisabled: boolean
  turns: LandingTurn[]
}) {
  if (turns.length === 0) {
    return <ChatEmptyState onSuggestion={onSuggestion} />
  }

  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollEdgeThreshold={48}
      scrollMargin={12}
      scrollPreviousItemPeek={56}
    >
      <MessageScroller className="bg-transparent">
        <MessageScrollerViewport className="p-3">
          <MessageScrollerContent aria-busy={isStreaming} className="gap-3">
            {turns.map((turn) => (
              <MessageScrollerItem
                key={turn.id}
                messageId={turn.id}
                scrollAnchor
              >
                <TurnMessage
                  onRetry={onRetryTurn}
                  retryDisabled={retryDisabled}
                  turn={turn}
                />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          aria-label="Scroll to latest message"
          className="bottom-3 shadow-lg"
          variant="secondary"
        />
      </MessageScroller>
    </MessageScrollerProvider>
  )
})
