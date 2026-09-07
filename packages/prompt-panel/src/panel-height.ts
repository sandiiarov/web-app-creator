import { MIN_PANEL_HEIGHT } from './panel-constants'

/** Keep the opposite edge pinned and every resized pixel inside the viewport. */
export function resizePanelHeight(
  edge: 'bottom' | 'top',
  top: number,
  startHeight: number,
  delta: number,
  viewportHeight: number,
  minTop = 0,
) {
  const bottom = Math.min(viewportHeight, top + startHeight)
  const available = Math.max(
    0,
    edge === 'bottom' ? viewportHeight - top : bottom - minTop,
  )
  const candidate = startHeight + (edge === 'bottom' ? delta : -delta)
  const height = Math.min(
    available,
    Math.max(Math.min(MIN_PANEL_HEIGHT, available), candidate),
  )
  return { height, top: edge === 'bottom' ? top : bottom - height }
}
