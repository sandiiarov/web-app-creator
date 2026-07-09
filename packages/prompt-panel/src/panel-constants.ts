export const COLLAPSED_HEIGHT = 37
export const PANEL_HEIGHT = 560
export const PANEL_WIDTH = 420
export const PANEL_MARGIN = 8
export const PANEL_WIDTH_CSS_VAR = '--landing-panel-width'

/** Minimum horizontal panel width; also the default width. */
export const MIN_PANEL_WIDTH = PANEL_WIDTH

export type PanelLayout = 'floating' | 'left-sidebar' | 'right-sidebar'

export type PanelPosition = {
  x: number
  y: number
}

export type PanelStatus = 'done' | 'error' | 'generating' | 'ready' | 'stopped'

export type PanelTheme = 'dark' | 'light' | 'system'

/** Clamp a horizontal panel width to the allowed [min, max] range.
 * `max` defaults to half the viewport (`maxPanelWidth`) but can be tightened
 * (e.g. to keep the panel inside the viewport while resizing a given edge). */
export function clampPanelWidth(
  width: number,
  max: number = maxPanelWidth(),
): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH
  return Math.min(max, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

/** Maximum horizontal panel width: half the viewport. */
export function maxPanelWidth(): number {
  return Math.floor(window.innerWidth / 2)
}

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
