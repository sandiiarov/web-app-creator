import { MotionNumber } from '@workspace/ui/components/motion-number'
import { cn } from '@workspace/ui/lib/utils'
import { useEffect, useState } from 'react'

import { formatDuration } from './domain'

/**
 * Live elapsed timer (1s tick) while a step is active; frozen duration once
 * it finishes. Renders nothing when neither startedAt nor durationMs exists
 * (older logs without timing).
 */
export function StepElapsed({
  active,
  className,
  durationMs,
  startedAt,
}: {
  active: boolean
  className?: string
  durationMs?: number | undefined
  startedAt?: number | undefined
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [active, startedAt])

  const elapsedMs =
    durationMs ??
    (active && startedAt !== undefined
      ? Math.max(0, now - startedAt)
      : undefined)
  if (elapsedMs === undefined) return null

  return (
    <span
      aria-label={formatDuration(elapsedMs)}
      className={cn(
        'inline-flex shrink-0 items-baseline gap-px font-mono text-[11px] leading-tight text-muted-foreground tabular-nums',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-baseline gap-px">
        <ElapsedValue ms={elapsedMs} />
      </span>
    </span>
  )
}

/** Rolling clock digits follow the shared motion preference. */
function ElapsedValue({ ms }: { ms: number }) {
  if (ms < 1_000) return <>{formatDuration(ms)}</>
  const totalSeconds = Math.floor(ms / 1_000)
  if (totalSeconds < 60) {
    return (
      <>
        <MotionNumber value={totalSeconds} />
        <span>s</span>
      </>
    )
  }
  return (
    <>
      <MotionNumber suffix="m" value={Math.floor(totalSeconds / 60)} />
      <MotionNumber
        format={{ minimumIntegerDigits: 2, useGrouping: false }}
        value={totalSeconds % 60}
      />
      <span>s</span>
    </>
  )
}
