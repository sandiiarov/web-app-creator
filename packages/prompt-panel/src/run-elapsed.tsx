import { useEffect, useState } from 'react'

import type { LandingTurn } from './domain'
import { StepElapsed } from './step-elapsed'

/** Anchor live elapsed time to a real server duration; old untimed logs stay untimed. */
export function RunElapsed({ turn }: { turn: LandingTurn }) {
  const stats = turn.parts.findLast((part) => part.type === 'stats')
  const duration = stats?.type === 'stats' ? stats.durationMs : undefined
  const [startedAt, setStartedAt] = useState<number>()

  useEffect(() => {
    if (duration !== undefined) setStartedAt(Date.now() - duration)
  }, [duration])

  return (
    <StepElapsed
      active={turn.isStreaming}
      durationMs={turn.isStreaming ? undefined : duration}
      startedAt={startedAt}
    />
  )
}
