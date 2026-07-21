// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RunStatus } from '../lib/projects-api'
import { StatusBadge } from './projects-page'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderBadge(status: RunStatus): {
  el: HTMLElement | null
  text: string
} {
  act(() => root.render(<StatusBadge status={status} />))
  const el = container.querySelector<HTMLElement>('[data-status]')
  return { el, text: container.textContent ?? '' }
}

describe('StatusBadge', () => {
  it('renders nothing for an idle project', () => {
    const { el, text } = renderBadge('idle')
    expect(text).toBe('')
    expect(el).toBeNull()
  })

  it('shows Generating for a running project', () => {
    const { el, text } = renderBadge('running')
    expect(text).toContain('Generating')
    expect(el?.dataset.status).toBe('running')
  })

  it('shows Failed for an errored project and Interrupted for a crashed one', () => {
    expect(renderBadge('error').text).toContain('Failed')
    expect(renderBadge('interrupted').text).toContain('Interrupted')
  })

  it('shows Stopped for a user-stopped project', () => {
    expect(renderBadge('stopped').text).toContain('Stopped')
  })
})
