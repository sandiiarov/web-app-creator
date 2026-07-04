export const COLLAPSED_HEIGHT = 37
export const PANEL_HEIGHT = 560
export const PANEL_WIDTH = 420
export const PANEL_MARGIN = 8

export type PanelLayout = 'floating' | 'left-sidebar' | 'right-sidebar'

export type PanelPosition = {
  x: number
  y: number
}

export type PanelStatus = 'done' | 'error' | 'generating' | 'ready' | 'stopped'

export type PanelTheme = 'dark' | 'light' | 'system'

export const STATUS_LABELS: Record<PanelStatus, string> = {
  done: 'Done',
  error: 'Error',
  generating: 'Generating',
  ready: 'Ready',
  stopped: 'Stopped',
}
