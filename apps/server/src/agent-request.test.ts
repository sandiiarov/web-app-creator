import { describe, expect, it } from 'vitest'

import { parseAgentRequest } from './agent-request.ts'

describe('parseAgentRequest', () => {
  it('accepts JSON request data without preview path policy checks', () => {
    expect(parseAgentRequest(createRequest())).toEqual({
      chatId: 'chat-1',
      files: [
        {
          content: 'secret',
          encoding: 'utf8',
          path: '/.env',
        },
        {
          content: 'export function App() {}',
          path: '/src/../App.tsx',
        },
      ],
      preview: {
        entrypoint: '/src/App.tsx',
      },
      prompt: 'Update the heading',
      selectedElement: null,
      version: 1,
    })
  })

  it('rejects non-object bodies', () => {
    expect(() => parseAgentRequest(null)).toThrow(
      'Expected JSON object request body.',
    )
  })

  it('rejects non-string prompts', () => {
    expect(() =>
      parseAgentRequest({
        ...createRequest(),
        prompt: 1,
      }),
    ).toThrow('Expected prompt to be a string.')
  })

  it('rejects non-array files', () => {
    expect(() =>
      parseAgentRequest({
        ...createRequest(),
        files: {},
      }),
    ).toThrow('Expected files array.')
  })

  it('rejects non-string file paths and contents', () => {
    expect(() =>
      parseAgentRequest({
        ...createRequest(),
        files: [{ content: 'ok', path: 1 }],
      }),
    ).toThrow('Expected every file path to be a string.')

    expect(() =>
      parseAgentRequest({
        ...createRequest(),
        files: [{ content: 1, path: '/src/App.tsx' }],
      }),
    ).toThrow('Expected file content to be a string: /src/App.tsx')
  })
})

function createRequest() {
  return {
    chatId: 'chat-1',
    files: [
      {
        content: 'secret',
        encoding: 'utf8',
        path: '/.env',
      },
      {
        content: 'export function App() {}',
        path: '/src/../App.tsx',
      },
    ],
    preview: {
      entrypoint: '/src/App.tsx',
    },
    prompt: 'Update the heading',
    selectedElement: null,
    version: 1,
  }
}
