import { describe, expect, it } from 'vitest'

import {
  INSPECTOR_SELECTION_MESSAGE,
  INSPECTOR_SHORTCUT_MESSAGE,
  isInspectorSelectionMessage,
  isInspectorShortcutMessage,
} from './inspector-messages'

describe('inspector message guards', () => {
  it('recognizes inspector selection messages with object payloads', () => {
    expect(
      isInspectorSelectionMessage({
        payload: {},
        type: INSPECTOR_SELECTION_MESSAGE,
      }),
    ).toBe(true)
  })

  it('rejects malformed selection messages', () => {
    expect(
      isInspectorSelectionMessage({
        payload: null,
        type: INSPECTOR_SELECTION_MESSAGE,
      }),
    ).toBe(false)
    expect(isInspectorSelectionMessage(null)).toBe(false)
  })

  it('recognizes inspector shortcut messages', () => {
    expect(
      isInspectorShortcutMessage({ type: INSPECTOR_SHORTCUT_MESSAGE }),
    ).toBe(true)
    expect(
      isInspectorShortcutMessage({ type: INSPECTOR_SELECTION_MESSAGE }),
    ).toBe(false)
  })
})
