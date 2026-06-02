import type { SelectedElement } from './agent'

export const INSPECTOR_CONTROL_MESSAGE = 'web-app-creator:inspector-control'
export const INSPECTOR_SELECTION_MESSAGE = 'web-app-creator:element-selected'
export const INSPECTOR_SHORTCUT_MESSAGE = 'web-app-creator:inspector-shortcut'

export type InspectorSelectionMessage = {
  payload: SelectedElement
  type: typeof INSPECTOR_SELECTION_MESSAGE
}

export type InspectorShortcutMessage = {
  type: typeof INSPECTOR_SHORTCUT_MESSAGE
}

export function isInspectorSelectionMessage(
  value: unknown,
): value is InspectorSelectionMessage {
  return (
    isRecord(value) &&
    value.type === INSPECTOR_SELECTION_MESSAGE &&
    isRecord(value.payload)
  )
}

export function isInspectorShortcutMessage(
  value: unknown,
): value is InspectorShortcutMessage {
  return isRecord(value) && value.type === INSPECTOR_SHORTCUT_MESSAGE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
