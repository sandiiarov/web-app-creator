// @vitest-environment happy-dom

import { Button } from '@workspace/ui/components/button'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LANDING_MODELS,
  type LandingAgentSendResult,
  type LandingModels,
  type LandingTurn,
  type PromptAttachmentInput,
} from './domain'
import { PreviewViewportMenu } from './panel-command-menu'
import type { PreviewViewport } from './panel-constants'
import { PromptPanel } from './prompt-panel'

let container: HTMLDivElement
let root: Root
let setDraft!: (value: {
  attachments: PromptAttachmentInput[]
  prompt: string
}) => void

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('prompt submission acknowledgment', () => {
  it('retains a newer complete draft when an older send is accepted', async () => {
    const acknowledgment = deferred<LandingAgentSendResult>()
    await act(async () => {
      root.render(<Harness onSend={() => acknowledgment.promise} />)
    })
    const form = container.querySelector('form')
    if (!form) throw new Error('expected prompt form')
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true })))
    await act(async () => {
      setDraft({
        attachments: [
          { id: 'hero', kind: 'element', name: 'Hero', selector: '#hero' },
        ],
        prompt: 'Newer edit',
      })
    })
    await act(async () => {
      acknowledgment.resolve({
        outcome: 'accepted',
        turnId: 'turn-1',
      })
      await acknowledgment.promise
    })
    expect(
      container.querySelector<HTMLTextAreaElement>('textarea')?.value,
    ).toBe('Newer edit')
    expect(
      container.querySelector('[aria-label="Locate Hero on page"]'),
    ).not.toBeNull()
  })

  it('does not restore stale attachments after a delayed file conversion', async () => {
    const conversionStarted = deferred<void>()
    let finishConversion!: () => void
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
      function (this: FileReader) {
        finishConversion = () => {
          Object.defineProperty(this, 'result', {
            configurable: true,
            value: 'data:image/png;base64,AA==',
          })
          this.onload?.call(
            this,
            new ProgressEvent('load') as ProgressEvent<FileReader>,
          )
        }
        conversionStarted.resolve()
      },
    )
    await act(async () => {
      root.render(
        <Harness
          onSend={async () => ({ outcome: 'accepted', turnId: 'turn-1' })}
        />,
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('expected file input')
    const file = new File([new Uint8Array([0])], 'stale.png', {
      type: 'image/png',
    })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { 0: file, item: () => file, length: 1 },
    })

    act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
    await conversionStarted.promise
    await act(async () => {
      setDraft({
        attachments: [
          {
            id: 'restored',
            kind: 'element',
            name: 'Restored',
            selector: '#restored',
          },
        ],
        prompt: 'Restored draft',
      })
    })
    await act(async () => {
      finishConversion()
      await Promise.resolve()
    })

    expect(
      container.querySelector('[aria-label="Locate Restored on page"]'),
    ).not.toBeNull()
    expect(container.textContent).not.toContain('stale.png')
  })
})

describe('shared logo header', () => {
  const accepted = async (): Promise<LandingAgentSendResult> => ({
    outcome: 'accepted',
    turnId: 'turn-1',
  })

  it('keeps the non-clickable logo and five ordered controls when collapsed without remounting content', async () => {
    await act(async () => root.render(<Harness onSend={accepted} />))
    const panel = container.querySelector<HTMLElement>(
      '[data-landing-prompt-panel]',
    )!
    const header = panel.querySelector('header')!
    const logo = header.querySelector('.assistant-logo')!
    const composer = panel.querySelector('textarea')!
    const conversation = panel.querySelector('#landing-chat')!

    expect(
      Array.from(header.querySelectorAll('button'), (button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Open projects',
      'Refresh preview',
      'Open panel layout menu. Current layout: Floating.',
      'Preview viewport. Current: Desktop.',
      'Minimize conversation',
    ])
    expect(logo.tagName).toBe('SPAN')
    expect(logo.closest('button, a, [role="button"]')).toBeNull()
    await act(async () => (logo as HTMLElement).click())
    expect(panel.dataset.projectsOpen).toBe('false')
    expect(header.querySelector('h1')).toBeNull()
    expect(header.textContent).not.toContain('Project')
    expect(panel.getAttribute('aria-label')).toBe('Project')
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Minimize conversation"]',
        )!
        .click()
    })

    expect(panel.dataset.collapsed).toBe('true')
    expect(panel.querySelector('header')).toBe(header)
    expect(header.closest('[hidden]')).toBeNull()
    expect(header.querySelectorAll('button')).toHaveLength(5)
    expect(panel.querySelector('textarea')).toBe(composer)
    expect(composer.closest('[hidden]')).not.toBeNull()
    expect(panel.querySelector('#landing-chat')).toBe(conversation)
    expect(document.activeElement).toBe(
      header.querySelector('[data-panel-toggle]'),
    )
    await act(async () => (logo as HTMLElement).click())
    expect(panel.dataset.collapsed).toBe('true')

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Show conversation"]')!
        .click()
    })
    expect(panel.dataset.collapsed).toBe('false')
    expect(composer.closest('[hidden]')).toBeNull()
    expect(composer.value).toBe('Original draft')
  })

  it('opens layout and projects directly from the compact header', async () => {
    await act(async () => root.render(<Harness onSend={accepted} />))
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Minimize conversation"]',
        )!
        .click()
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label^="Open panel layout menu"]',
        )!
        .dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        )
    })
    const panel = container.querySelector<HTMLElement>(
      '[data-landing-prompt-panel]',
    )!
    const menu = document.querySelector('[role="menu"]')!
    expect(menu).not.toBeNull()
    expect(panel.dataset.collapsed).toBe('true')
    const dock = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent?.startsWith('Left sidebar'))!
    await act(async () => dock.click())
    expect(panel.dataset.layout).toBe('left-sidebar')
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-panel-toggle]')!
        .click(),
    )
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open projects"]')!
        .click(),
    )
    expect(panel.dataset.collapsed).toBe('false')
    expect(panel.dataset.projectsOpen).toBe('true')
    expect(
      container.querySelector('.assistant-projects-view')?.textContent,
    ).toBe('Project switcher')
  })

  it('changes viewport without restoring the compact panel', async () => {
    await act(async () => root.render(<Harness onSend={accepted} />))
    const panel = container.querySelector<HTMLElement>(
      '[data-landing-prompt-panel]',
    )!
    await act(async () =>
      panel.querySelector<HTMLButtonElement>('[data-panel-toggle]')!.click(),
    )
    await act(async () =>
      panel
        .querySelector<HTMLButtonElement>('[aria-label^="Preview viewport"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        ),
    )
    const tablet = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent?.startsWith('Tablet'))!
    await act(async () => tablet.click())
    expect(panel.dataset.collapsed).toBe('true')
    expect(
      panel.querySelector('[aria-label="Preview viewport. Current: Tablet."]'),
    ).not.toBeNull()
  })

  it('contracts from the top right and preserves that anchor after dragging and restoring', async () => {
    await act(async () => root.render(<Harness onSend={accepted} />))
    const panel = container.querySelector<HTMLElement>(
      '[data-landing-prompt-panel]',
    )!
    const panelRect = vi
      .spyOn(panel, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(100, 100, 352, 360))
    const header = panel.querySelector<HTMLElement>('header')!
    header.style.padding = '3px'
    panel.style.border = '1px solid black'
    panel.querySelector<HTMLElement>(
      '.panel-header-controls',
    )!.style.columnGap = '4px'
    vi.spyOn(header, 'offsetHeight', 'get').mockReturnValue(34)
    vi.spyOn(
      panel.querySelector<HTMLElement>('.assistant-logo')!,
      'offsetWidth',
      'get',
    ).mockReturnValue(24)
    vi.spyOn(
      panel.querySelector<HTMLElement>('[data-panel-actions]')!,
      'offsetWidth',
      'get',
    ).mockReturnValue(148)
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Minimize conversation"]',
        )!
        .click()
    })
    expect(
      JSON.parse(
        window.localStorage.getItem('landing.promptPanel.launcher.v1')!,
      ),
    ).toEqual({ x: 268, y: 100 })
    expect(panel.style.width).toBe('184px')
    expect(panel.style.height).toBe('36px')
    panelRect.mockReturnValue(new DOMRect(268, 100, 184, 36))
    const logo = container.querySelector<HTMLElement>('.assistant-logo')!
    Object.assign(logo, {
      hasPointerCapture: vi.fn<(pointerId: number) => boolean>(() => true),
      releasePointerCapture: vi.fn<(pointerId: number) => void>(),
      setPointerCapture: vi.fn<(pointerId: number) => void>(),
    })
    for (const [type, x] of [
      ['pointerdown', 110],
      ['pointermove', 160],
      ['pointerup', 160],
    ] as const) {
      await act(async () => {
        logo.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            button: 0,
            clientX: x,
            clientY: 110,
            isPrimary: true,
            pointerId: 1,
          }),
        )
      })
    }
    await act(async () => logo.click())
    expect(panel.dataset.collapsed).toBe('true')
    expect(logo.setPointerCapture).toHaveBeenCalledWith(1)
    expect(logo.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(
      JSON.parse(
        window.localStorage.getItem('landing.promptPanel.launcher.v1')!,
      ),
    ).toEqual({ x: 318, y: 100 })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Show conversation"]')!
        .click()
    })
    expect(panel.dataset.collapsed).toBe('false')
    expect(panel.style.left).toBe('150px')
    expect(panel.style.top).toBe('100px')
  })

  it('keeps the logo in both states and pauses active feedback when disconnected', async () => {
    await act(async () =>
      root.render(<Harness isStreaming onSend={accepted} />),
    )
    const logo = container.querySelector<HTMLElement>('.assistant-logo')!
    expect(logo.dataset.active).toBe('true')
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Minimize conversation"]',
        )!
        .click()
    })
    expect(logo.dataset.active).toBe('true')
    await act(async () =>
      root.render(
        <Harness connection="offline" isStreaming onSend={accepted} />,
      ),
    )
    expect(logo.dataset.active).toBe('false')
    expect(logo.dataset.attention).toBe('true')
    expect(logo.getAttribute('aria-label')).toContain('Disconnected')
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function Harness({
  connection = 'live',
  isStreaming = false,
  onSend,
}: {
  connection?: 'live' | 'offline'
  isStreaming?: boolean
  onSend: () => Promise<LandingAgentSendResult>
}) {
  const [viewport, setViewport] = useState<PreviewViewport>('desktop')
  const [draft, updateDraft] = useState({
    attachments: [] as PromptAttachmentInput[],
    prompt: 'Original draft',
  })
  setDraft = updateDraft
  return (
    <TooltipProvider>
      <PromptPanel
        canSelectElement
        compactionPercent={80}
        connection={connection}
        draft={draft}
        draftReady
        elementSelectionActive={false}
        isStopping={false}
        isStreaming={isStreaming}
        models={DEFAULT_LANDING_MODELS}
        onAllProjects={vi.fn<() => void>()}
        onCompactionPercentChange={vi.fn<(percent: number) => void>()}
        onDraftChange={(change) => updateDraft(change)}
        onElementSelectionToggle={vi.fn<() => void>()}
        onLocateElement={vi.fn<(selector: string) => void>()}
        onModelsChange={vi.fn<(models: LandingModels) => void>()}
        onReconnect={vi.fn<() => void>()}
        onRetryTurn={vi.fn<(turn: LandingTurn) => void>()}
        onSelectedElementAttachmentConsumed={vi.fn<() => void>()}
        onSend={onSend}
        onStop={vi.fn<() => void>()}
        onToggleTheme={vi.fn<() => void>()}
        pageActions={null}
        pageHeaderActions={{
          refresh: <Button aria-label="Refresh preview" />,
          viewport: (
            <PreviewViewportMenu
              onViewportChange={setViewport}
              viewport={viewport}
            />
          ),
        }}
        projectSwitcher={<div>Project switcher</div>}
        projectTitle="Project"
        selectedElementAttachment={null}
        theme="light"
        turns={[]}
      />
    </TooltipProvider>
  )
}
