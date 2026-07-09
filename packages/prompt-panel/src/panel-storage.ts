import {
  type PanelLayout,
  type PanelPosition,
  PANEL_WIDTH,
  clampPanelWidth,
} from './panel-constants'

export const PANEL_POSITION_STORAGE_KEY = 'landing.promptPanel.position.v1'

export type StoredPanelState = Partial<PanelPosition> & {
  collapsed?: boolean
  layout?: PanelLayout
  width?: number
}

const PANEL_LAYOUTS: readonly PanelLayout[] = [
  'floating',
  'left-sidebar',
  'right-sidebar',
]

/**
 * Effective preview layout persisted from the last panel interaction.
 * A collapsed panel reads as `floating` so a minimized panel does not reserve
 * a docked column for the preview until it is expanded again.
 */
export function readStoredPanelLayout(): PanelLayout {
  const state = readStoredPanelState()
  if (!state || state.collapsed || !state.layout) return 'floating'
  return PANEL_LAYOUTS.includes(state.layout) ? state.layout : 'floating'
}

export function readStoredPanelState(): null | StoredPanelState {
  try {
    const raw = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    return parsed as StoredPanelState
  } catch {
    return null
  }
}

/**
 * Persisted panel width clamped to the allowed range, or the default.
 */
export function readStoredPanelWidth(): number {
  const width = readStoredPanelState()?.width
  if (typeof width !== 'number') return PANEL_WIDTH
  return clampPanelWidth(width)
}
