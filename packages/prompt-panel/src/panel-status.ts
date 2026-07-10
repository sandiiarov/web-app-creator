import type { LandingTurn } from './domain'
import type { PanelStatus } from './panel-constants'

export function panelStatus({
  isStreaming,
  turns,
}: {
  isStreaming: boolean
  turns: LandingTurn[]
}): PanelStatus {
  if (isStreaming) {
    return 'generating'
  }

  const latest = turns[turns.length - 1]

  if (latest?.error) {
    return 'error'
  }

  if (latest?.stopped) {
    return 'stopped'
  }

  if (latest && latest.parts.length > 0) {
    return 'done'
  }

  return 'ready'
}
