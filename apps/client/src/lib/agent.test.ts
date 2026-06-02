import { describe, expect, it } from 'vitest'

import {
  agentResponseMessage,
  createAgentRequest,
  type SelectedElement,
} from './agent'

describe('createAgentRequest', () => {
  it('includes the user prompt, selection context, preview metadata, and files', () => {
    const selection: SelectedElement = {
      componentName: 'HeroCard',
      element: {
        className: 'card',
        rect: {
          height: 40,
          width: 120,
          x: 10,
          y: 20,
        },
        tagName: 'section',
        text: 'Hello world',
      },
      ownerStack: ['App', 'HeroCard'],
      source: {
        fileName: '/src/App.tsx',
        lineNumber: 12,
      },
    }

    expect(
      createAgentRequest({
        files: [
          {
            content: 'export function App() {}',
            encoding: 'utf8',
            path: '/src/App.tsx',
          },
        ],
        prompt: 'Make it brighter',
        selectedElement: selection,
      }),
    ).toEqual({
      files: [
        {
          content: 'export function App() {}',
          encoding: 'utf8',
          path: '/src/App.tsx',
        },
      ],
      preview: {
        entrypoint: '/src/main.tsx',
        rootFiles: ['/index.html', '/package.json'],
      },
      prompt: 'Make it brighter',
      selectedElement: selection,
      version: 1,
    })
  })
})

describe('agentResponseMessage', () => {
  it('summarizes successful file changes', () => {
    expect(
      agentResponseMessage({
        changedFiles: [
          {
            content: 'updated',
            encoding: 'utf8',
            path: '/src/App.tsx',
          },
        ],
        deletedPaths: [],
        diagnostics: [],
        message: 'Updated the heading.',
        ok: true,
      }),
    ).toBe('Updated the heading. (1 file changed)')
  })

  it('returns error text for failed responses', () => {
    expect(
      agentResponseMessage({
        error: 'Request failed',
        ok: false,
      }),
    ).toBe('Request failed')
  })
})
