import type { PanelStatus } from '@workspace/prompt-panel'

import type { RunStatus } from './projects-api'

/** Map a project's durable `RunStatus` to the prompt-panel's `PanelStatus` so
 *  the project list reuses the exact same status pill the editor panel header
 *  shows (`Ready` / `Generating` / `Error` / `Stopped`). `interrupted` (a
 *  process restart mid-run) collapses to `error` — the panel has no
 *  interrupted pill. */
export function runStatusToPanelStatus(status: RunStatus): PanelStatus {
  switch (status) {
    case 'error':
    case 'interrupted':
      return 'error'
    case 'running':
      return 'generating'
    case 'stopped':
      return 'stopped'
    case 'idle':
    default:
      return 'ready'
  }
}
