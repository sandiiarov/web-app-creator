import { Button } from '@workspace/ui/components/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@workspace/ui/components/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { Check, ChevronDown, Search } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from 'react'

import { AnthropicIcon } from './anthropic-icon'
import { BytedanceIcon } from './bytedance-icon'
import { DeepseekIcon } from './deepseek-icon'
import {
  formatTokenPrice,
  LANDING_MODEL_GROUPS,
  type LandingModelPricing,
  type LandingModels,
  type LandingModelRole,
  modelPricingFor,
  selectLandingModel,
  syncedVisionModel,
} from './domain'
import { GeminiIcon } from './gemini-icon'
import { GlmIcon } from './glm-icon'
import { KimiIcon } from './kimi-icon'
import { MinimaxIcon } from './minimax-icon'
import { MODEL_ROLE_META } from './model-role-meta'
import { NvidiaIcon } from './nvidia-icon'
import { OpenaiIcon } from './openai-icon'
import { PoolsideIcon } from './poolside-icon'
import { TencentIcon } from './tencent-icon'
import { XaiIcon } from './xai-icon'
import { XiaomiIcon } from './xiaomi-icon'

const MODEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'anthropic/claude-fable-5': AnthropicIcon,
  'anthropic/claude-fable-5:nitro': AnthropicIcon,
  'anthropic/claude-haiku-4.5': AnthropicIcon,
  'anthropic/claude-haiku-4.5:nitro': AnthropicIcon,
  'anthropic/claude-opus-5': AnthropicIcon,
  'anthropic/claude-opus-5:nitro': AnthropicIcon,
  'anthropic/claude-sonnet-5': AnthropicIcon,
  'anthropic/claude-sonnet-5:nitro': AnthropicIcon,
  'bytedance-seed/seed-2.0-mini': BytedanceIcon,
  'bytedance-seed/seedream-4.5': BytedanceIcon,
  'deepseek/deepseek-v4-flash-0731:nitro': DeepseekIcon,
  'google/gemini-3.1-flash-image': GeminiIcon,
  'google/gemini-3.1-flash-lite-image': GeminiIcon,
  'google/gemini-3.1-pro-preview': GeminiIcon,
  'google/gemini-3.1-pro-preview:nitro': GeminiIcon,
  'google/gemini-3.5-flash-lite': GeminiIcon,
  'google/gemini-3.6-flash': GeminiIcon,
  'google/gemini-3.6-flash:nitro': GeminiIcon,
  'minimax/minimax-m3': MinimaxIcon,
  'moonshotai/kimi-k2.7-code': KimiIcon,
  'moonshotai/kimi-k2.7-code:nitro': KimiIcon,
  'moonshotai/kimi-k3': KimiIcon,
  'moonshotai/kimi-k3:nitro': KimiIcon,
  'nvidia/nemotron-3-ultra-550b-a55b:nitro': NvidiaIcon,
  'openai/gpt-5.6-luna': OpenaiIcon,
  'openai/gpt-5.6-luna:nitro': OpenaiIcon,
  'openai/gpt-5.6-sol': OpenaiIcon,
  'openai/gpt-5.6-sol:nitro': OpenaiIcon,
  'openai/gpt-5.6-terra': OpenaiIcon,
  'openai/gpt-5.6-terra:nitro': OpenaiIcon,
  'openai/gpt-image-2': OpenaiIcon,
  'poolside/laguna-s-2.1:nitro': PoolsideIcon,
  'tencent/hy3:nitro': TencentIcon,
  'x-ai/grok-4.5': XaiIcon,
  'x-ai/grok-4.5:nitro': XaiIcon,
  'x-ai/grok-imagine-image-quality': XaiIcon,
  'xiaomi/mimo-v2.5': XiaomiIcon,
  'z-ai/glm-5.2:nitro': GlmIcon,
  'z-ai/glm-5v-turbo': GlmIcon,
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  'bytedance-seed': 'ByteDance',
  deepseek: 'DeepSeek',
  google: 'Google',
  minimax: 'MiniMax',
  moonshotai: 'Moonshot AI',
  nvidia: 'NVIDIA',
  openai: 'OpenAI',
  poolside: 'Poolside',
  tencent: 'Tencent',
  'x-ai': 'xAI',
  xiaomi: 'Xiaomi',
  'z-ai': 'Z.AI',
}

const ROLE_ORDER: LandingModelRole[] = ['text', 'image', 'vision']

export interface ModelDropdownProps {
  /** Live per-1M pricing map (from `/api/models`); static snapshot fallback. */
  modelPricing?: Record<string, LandingModelPricing>
  models: LandingModels
  onModelsChange: (models: LandingModels) => void
}

/**
 * A model picker with one trigger showing all three role selections (text,
 * image, vision). Opens a popover with full-width role tabs across the top
 * and one scrollable menu of every model in the active role, grouped under
 * provider headers, with per-1M pricing under each name. Arrow keys rove
 * between models; the selected model is scrolled into view on open. Selecting
 * a model keeps the popover open so all three roles can be set in one session.
 */
export function ModelDropdown({
  modelPricing,
  models,
  onModelsChange,
}: ModelDropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeRole, setActiveRole] = useState<LandingModelRole>('text')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const activeGroup = LANDING_MODEL_GROUPS.find(
    (entry) => entry.role === activeRole,
  )!

  // Providers available in the active role with their models, in
  // first-appearance order — rendered as group headers over flat model rows.
  const providers: {
    Icon?: ComponentType<{ className?: string }>
    name: string
    options: typeof activeGroup.options
    prefix: string
  }[] = []
  for (const option of activeGroup.options) {
    const prefix = providerOf(option.id)
    let provider = providers.find((entry) => entry.prefix === prefix)
    if (!provider) {
      provider = {
        Icon: MODEL_ICONS[option.id],
        name: PROVIDER_NAMES[prefix] ?? prefix,
        options: [],
        prefix,
      }
      providers.push(provider)
    }
    provider.options.push(option)
  }

  const selectedId = models[activeRole]
  const [focusId, setFocusId] = useState(selectedId)
  useEffect(() => {
    setFocusId(selectedId)
  }, [selectedId])

  // Vision-sync invariant: a vision-capable text model serves vision itself
  // (server direct mode), so every other vision row is disabled.
  const visionSyncId =
    activeRole === 'vision' ? syncedVisionModel(models.text) : null

  // Filter model rows by name, id, or provider; empty groups drop out.
  const normalizedQuery = query.trim().toLowerCase()
  const filteredProviders = normalizedQuery
    ? providers
        .map((provider) => ({
          ...provider,
          options: provider.options.filter(
            (option) =>
              option.label.toLowerCase().includes(normalizedQuery) ||
              option.id.toLowerCase().includes(normalizedQuery) ||
              provider.name.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((provider) => provider.options.length > 0)
    : providers

  // Roving tab stop must always land on a visible row.
  const visibleIds = filteredProviders.flatMap((provider) =>
    provider.options.map((option) => option.id),
  )
  const effectiveFocusId = visibleIds.includes(focusId)
    ? focusId
    : visibleIds[0]

  const listRef = useRef<HTMLDivElement | null>(null)

  // Bring the selected model into view when the popover opens or the role
  // tab changes, so the current choice is visible without hunting.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeRole])

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        '[role="radio"]:not([aria-disabled="true"])',
      ) ?? [],
    )
    if (rows.length === 0) return
    const current = rows.indexOf(document.activeElement as HTMLElement)
    let next: number
    if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = rows.length - 1
    } else if (event.key === 'ArrowDown') {
      next = current < 0 ? 0 : (current + 1) % rows.length
    } else if (event.key === 'ArrowUp') {
      next =
        current < 0
          ? rows.length - 1
          : (current - 1 + rows.length) % rows.length
    } else {
      return
    }
    event.preventDefault()
    const row = rows[next]
    row?.focus()
    const id = row?.dataset.modelId
    if (id) setFocusId(id)
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery('')
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label="Models"
          className="px-1"
          size="xs"
          type="button"
          variant="outline"
        >
          {ROLE_ORDER.map((role, index) => {
            const option = optionFor(role, models[role])
            const Logo = option ? MODEL_ICONS[option.id] : undefined
            const RoleIcon = MODEL_ROLE_META[role].Icon
            return (
              <Tooltip key={role} open={open ? false : undefined}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'flex items-center gap-1 px-1',
                      index > 0 && 'border-l border-border',
                    )}
                  >
                    <RoleIcon
                      className={cn('size-3', MODEL_ROLE_META[role].color)}
                    />
                    {Logo ? <Logo className="size-3" /> : null}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <RoleIcon
                    className={cn('size-3.5', MODEL_ROLE_META[role].color)}
                  />
                  {MODEL_ROLE_META[role].label}
                  <span className="text-muted-foreground">·</span>
                  {Logo ? <Logo className="size-3.5" /> : null}
                  {option?.label ?? models[role]}
                </TooltipContent>
              </Tooltip>
            )
          })}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        sideOffset={6}
      >
        <div
          aria-label="Model role"
          className="flex border-b border-border"
          role="tablist"
        >
          {ROLE_ORDER.map((role) => {
            const meta = MODEL_ROLE_META[role]
            const active = role === activeRole
            return (
              <button
                aria-selected={active}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 p-2 text-xs',
                  'outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset',
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
                key={role}
                onClick={() => {
                  setActiveRole(role)
                  setQuery('')
                }}
                role="tab"
                type="button"
              >
                <meta.Icon className={cn('size-3.5', meta.color)} />
                {meta.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            aria-label="Search models"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                const first = listRef.current?.querySelector<HTMLElement>(
                  '[role="radio"]:not([aria-disabled="true"])',
                )
                first?.focus()
                const id = first?.dataset.modelId
                if (id) setFocusId(id)
              }
            }}
            placeholder="Search models"
            ref={inputRef}
            type="text"
            value={query}
          />
        </div>
        <div
          aria-label={activeGroup.title}
          className="max-h-80 overflow-y-auto p-1"
          onKeyDown={onListKeyDown}
          ref={listRef}
          role="radiogroup"
        >
          {filteredProviders.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No models match &quot;{query.trim()}&quot;
            </div>
          ) : null}
          {filteredProviders.map((provider, groupIndex) => (
            <div aria-label={provider.name} key={provider.prefix} role="group">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 pb-1 text-[10px] font-medium text-muted-foreground',
                  groupIndex === 0 ? 'pt-1' : 'pt-2',
                )}
              >
                {provider.Icon ? <provider.Icon className="size-3" /> : null}
                {provider.name}
              </div>
              {provider.options.map((option) => {
                const Icon = MODEL_ICONS[option.id]
                const pricing = modelPricingFor(option.id, modelPricing)
                const selected = models[activeRole] === option.id
                const locked =
                  visionSyncId != null && option.id !== visionSyncId
                return (
                  <button
                    aria-checked={selected}
                    aria-disabled={locked || undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-xs',
                      'outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset',
                      locked &&
                        'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground',
                    )}
                    data-model-id={option.id}
                    key={option.id}
                    onClick={() => {
                      if (locked) return
                      onModelsChange(
                        selectLandingModel(models, activeRole, option.id),
                      )
                    }}
                    role="radio"
                    tabIndex={option.id === effectiveFocusId ? 0 : -1}
                    type="button"
                  >
                    {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {pricing ? (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {pricing.image != null ? (
                            `${formatTokenPrice(pricing.image)} / image`
                          ) : pricing.imageOutput != null ? (
                            `${formatTokenPrice(pricing.imageOutput)} / M image tokens`
                          ) : (
                            <>
                              {formatTokenPrice(pricing.input)}/M in ·{' '}
                              {formatTokenPrice(pricing.output)}/M out
                              {pricing.cacheRead == null
                                ? ''
                                : ` · ${formatTokenPrice(pricing.cacheRead)}/M cache`}
                            </>
                          )}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="ml-auto size-3.5 shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function optionFor(role: LandingModelRole, modelId: string) {
  const group = LANDING_MODEL_GROUPS.find((entry) => entry.role === role)
  return group?.options.find((option) => option.id === modelId)
}

function providerOf(modelId: string) {
  return modelId.split('/')[0]!
}
