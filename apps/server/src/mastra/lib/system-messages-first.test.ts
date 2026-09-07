import { describe, expect, it } from 'vitest'

import { SystemMessagesFirstProcessor } from './system-messages-first.ts'

const processor = new SystemMessagesFirstProcessor()

function run(prompt: Array<Record<string, unknown>>) {
  return processor.processLLMRequest({
    prompt,
  } as unknown as Parameters<
    SystemMessagesFirstProcessor['processLLMRequest']
  >[0])
}

describe('SystemMessagesFirstProcessor', () => {
  it('returns undefined for an empty prompt', () => {
    expect(run([])).toBeUndefined()
  })

  it('returns undefined when a single system message already leads', () => {
    const prompt = [
      { content: 'instructions', role: 'system' },
      { content: 'hi', role: 'user' },
    ]
    expect(run(prompt)).toBeUndefined()
  })

  it('returns undefined when there are no system messages', () => {
    const prompt = [{ content: 'hi', role: 'user' }]
    expect(run(prompt)).toBeUndefined()
  })

  it('merges multiple leading system messages into one', () => {
    const result = run([
      { content: 'a', role: 'system' },
      { content: 'b', role: 'system' },
      { content: 'hi', role: 'user' },
    ])
    expect(result?.prompt).toEqual([
      { content: 'a\n\nb', role: 'system' },
      { content: 'hi', role: 'user' },
    ])
  })

  it('hoists a mid-conversation system message and merges it', () => {
    const result = run([
      { content: 'a', role: 'system' },
      { content: 'hi', role: 'user' },
      { content: 'late note', role: 'system' },
      { content: 'again', role: 'user' },
    ])
    expect(result?.prompt).toEqual([
      { content: 'a\n\nlate note', role: 'system' },
      { content: 'hi', role: 'user' },
      { content: 'again', role: 'user' },
    ])
  })

  it('drops empty system segments and the system slot when all are empty', () => {
    const result = run([
      { content: '', role: 'system' },
      { content: 'hi', role: 'user' },
      { content: '', role: 'system' },
    ])
    expect(result?.prompt).toEqual([{ content: 'hi', role: 'user' }])
  })
})
