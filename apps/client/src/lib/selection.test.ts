import { describe, expect, it } from 'vitest'

import type { SelectedElement } from './agent'
import { selectedElementLabel, selectionButtonClassName } from './selection'

describe('selectedElementLabel', () => {
  it('uses component and source information when available', () => {
    expect(
      selectedElementLabel(
        createSelection({
          componentName: 'HeroCard',
          source: {
            fileName: '/src/App.tsx',
            lineNumber: 42,
          },
        }),
      ),
    ).toBe('Selected HeroCard at /src/App.tsx:42')
  })

  it('falls back to the tag name and /src/App.tsx', () => {
    expect(selectedElementLabel(createSelection())).toBe(
      'Selected button at /src/App.tsx',
    )
  })
})

describe('selectionButtonClassName', () => {
  it('returns active and inactive Tailwind class sets', () => {
    expect(selectionButtonClassName(true)).toContain('bg-primary')
    expect(selectionButtonClassName(false)).toContain('bg-muted')
    expect(selectionButtonClassName(false)).toContain('hover:text-foreground')
  })
})

function createSelection(
  overrides: Partial<SelectedElement> = {},
): SelectedElement {
  return {
    element: {
      rect: {
        height: 10,
        width: 20,
        x: 1,
        y: 2,
      },
      tagName: 'button',
    },
    ownerStack: [],
    ...overrides,
  }
}
