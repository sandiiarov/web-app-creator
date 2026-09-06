// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { ProjectDraft } from '../lib/project-drafts'
import { useProjectDraft } from './use-project-draft'

const cache = vi.hoisted(() => new Map<string, ProjectDraft>())
vi.mock('../lib/project-drafts', () => ({
  cachedDraft: (key: string) => cache.get(key),
  EMPTY_DRAFT: { attachments: [], prompt: '' },
  loadDraft: async (key: string) =>
    cache.get(key) ?? { attachments: [], prompt: '' },
  saveDraft: async (key: string, draft: ProjectDraft) => {
    cache.set(key, draft)
  },
}))
let container: HTMLDivElement
let root: Root
let current: ReturnType<typeof useProjectDraft>
function Harness() {
  current = useProjectDraft('project')
  return null
}
beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  cache.clear()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
it('protects a new navigation draft from an earlier send resolving after unmount', async () => {
  cache.set('project', { attachments: [], prompt: 'First request' })
  await act(async () => root.render(<Harness />))
  const oldUpdate = current.update
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<Harness />))
  await act(async () =>
    current.update({ attachments: [], prompt: 'A new idea' }),
  )
  await act(async () =>
    oldUpdate((draft) =>
      draft.prompt === 'First request'
        ? { attachments: [], prompt: '' }
        : draft,
    ),
  )
  expect(cache.get('project')?.prompt).toBe('A new idea')
  expect(current.draft.prompt).toBe('A new idea')
})
