// @vitest-environment happy-dom

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
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function Harness({
  onSend,
}: {
  onSend: () => Promise<LandingAgentSendResult>
}) {
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
        connection="live"
        draft={draft}
        draftReady
        elementSelectionActive={false}
        isStopping={false}
        isStreaming={false}
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
        projectSwitcher={null}
        projectTitle="Project"
        selectedElementAttachment={null}
        theme="light"
        turns={[]}
      />
    </TooltipProvider>
  )
}
