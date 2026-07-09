export const COLLAPSED_HEIGHT = 37
export const PANEL_HEIGHT = 560
export const PANEL_WIDTH = 420
export const PANEL_MARGIN = 8

/** Minimum horizontal panel width; also the default width. */
export const MIN_PANEL_WIDTH = PANEL_WIDTH
/** Maximum horizontal panel width. */
export const MAX_PANEL_WIDTH = 840

/** Clamp a horizontal panel width to the allowed [min, max] range. */
export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

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

export type PreviewViewport = 'desktop' | 'mobile' | 'tablet'

export const PREVIEW_VIEWPORTS: readonly PreviewViewport[] = [
  'desktop',
  'tablet',
  'mobile',
]

export const DEFAULT_PREVIEW_VIEWPORT: PreviewViewport = 'desktop'
