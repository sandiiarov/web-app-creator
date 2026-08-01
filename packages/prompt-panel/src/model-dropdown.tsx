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
import { Check, ChevronDown } from 'lucide-react'
import { useState, type ComponentType } from 'react'

import { AnthropicIcon } from './anthropic-icon'
import { BytedanceIcon } from './bytedance-icon'
import { DeepseekIcon } from './deepseek-icon'
import {
  LANDING_MODEL_GROUPS,
  type LandingModels,
  type LandingModelRole,
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
  'anthropic/claude-haiku-4.5': AnthropicIcon,
  'anthropic/claude-haiku-4.5:nitro': AnthropicIcon,
  'anthropic/claude-opus-5': AnthropicIcon,
  'anthropic/claude-opus-5:nitro': AnthropicIcon,
  'anthropic/claude-sonnet-5': AnthropicIcon,
  'anthropic/claude-sonnet-5:nitro': AnthropicIcon,
  'bytedance-seed/seed-2.0-mini': BytedanceIcon,
  'bytedance-seed/seedream-4.5': BytedanceIcon,
  'deepseek/deepseek-v4-flash-0731:nitro': DeepseekIcon,
  'google/gemini-3.1-flash-lite-image': GeminiIcon,
  'minimax/minimax-m3': MinimaxIcon,
  'moonshotai/kimi-k2.7-code': KimiIcon,
  'moonshotai/kimi-k2.7-code:nitro': KimiIcon,
  'moonshotai/kimi-k3': KimiIcon,
  'moonshotai/kimi-k3:nitro': KimiIcon,
  'nvidia/nemotron-3-ultra-550b-a55b:nitro': NvidiaIcon,
  'openai/gpt-5.6-luna': OpenaiIcon,
  'openai/gpt-5.6-luna-pro': OpenaiIcon,
  'openai/gpt-5.6-luna-pro:nitro': OpenaiIcon,
  'openai/gpt-5.6-luna:nitro': OpenaiIcon,
  'openai/gpt-5.6-sol': OpenaiIcon,
  'openai/gpt-5.6-sol-pro': OpenaiIcon,
  'openai/gpt-5.6-sol-pro:nitro': OpenaiIcon,
  'openai/gpt-5.6-sol:nitro': OpenaiIcon,
  'openai/gpt-5.6-terra': OpenaiIcon,
  'openai/gpt-5.6-terra-pro': OpenaiIcon,
  'openai/gpt-5.6-terra-pro:nitro': OpenaiIcon,
  'openai/gpt-5.6-terra:nitro': OpenaiIcon,
  'openai/gpt-image-2': OpenaiIcon,
  'poolside/laguna-s-2.1:nitro': PoolsideIcon,
  'tencent/hy3:nitro': TencentIcon,
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
  models: LandingModels
  onModelsChange: (models: LandingModels) => void
}

/**
 * A model picker with one trigger showing all three role selections (text,
 * image, vision). Opens a popover with full-width role tabs across the top,
 * an icon-only provider sidebar on the left, and the selected provider's
 * models as a menu on the right. Selecting a model keeps the popover open so
 * all three roles can be set in one session.
 */
export function ModelDropdown({ models, onModelsChange }: ModelDropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeRole, setActiveRole] = useState<LandingModelRole>('text')
  const [activeProvider, setActiveProvider] = useState<null | string>(null)
  const activeGroup = LANDING_MODEL_GROUPS.find(
    (entry) => entry.role === activeRole,
  )!

  // Providers available in the active role, in first-appearance order.
  const providers: {
    Icon?: ComponentType<{ className?: string }>
    name: string
    prefix: string
  }[] = []
  for (const option of activeGroup.options) {
    const prefix = providerOf(option.id)
    if (!providers.some((entry) => entry.prefix === prefix)) {
      providers.push({
        Icon: MODEL_ICONS[option.id],
        name: PROVIDER_NAMES[prefix] ?? prefix,
        prefix,
      })
    }
  }

  // Show the explicitly picked provider, else the provider of the role's
  // currently selected model, else the first provider.
  const selectedProvider = providerOf(models[activeRole])
  const shownProvider =
    activeProvider && providers.some((entry) => entry.prefix === activeProvider)
      ? activeProvider
      : providers.some((entry) => entry.prefix === selectedProvider)
        ? selectedProvider
        : providers[0]?.prefix
  const visibleOptions = activeGroup.options.filter(
    (option) => providerOf(option.id) === shownProvider,
  )

  return (
    <Popover onOpenChange={setOpen} open={open}>
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
                  {Logo ? <Logo className="size-3.5" /> : null}
                  {option?.label ?? models[role]}
                </TooltipContent>
              </Tooltip>
            )
          })}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0" sideOffset={6}>
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
                  '-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 p-2 text-xs',
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                key={role}
                onClick={() => {
                  setActiveRole(role)
                  setActiveProvider(null)
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
        <div className="flex">
          <div className="flex w-11 flex-col gap-0.5 border-r border-border p-1">
            {providers.map((provider) => (
              <Tooltip key={provider.prefix}>
                <TooltipTrigger asChild>
                  <button
                    aria-label={provider.name}
                    aria-pressed={provider.prefix === shownProvider}
                    className={cn(
                      'flex items-center justify-center rounded-none p-2',
                      provider.prefix === shownProvider
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                    )}
                    onClick={() => setActiveProvider(provider.prefix)}
                    type="button"
                  >
                    {provider.Icon ? (
                      <provider.Icon className="size-4" />
                    ) : (
                      <span className="text-[10px]">{provider.name}</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{provider.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div
            aria-label={activeGroup.title}
            className="flex min-w-0 flex-1 flex-col gap-0.5 p-1"
            role="radiogroup"
          >
            {visibleOptions.map((option) => {
              const Icon = MODEL_ICONS[option.id]
              const selected = models[activeRole] === option.id
              return (
                <button
                  aria-checked={selected}
                  className="flex items-center gap-2 rounded-none px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  key={option.id}
                  onClick={() =>
                    onModelsChange({ ...models, [activeRole]: option.id })
                  }
                  role="radio"
                  type="button"
                >
                  {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
                  <span className="truncate">{option.label}</span>
                  {selected ? (
                    <Check className="ml-auto size-3.5 shrink-0" />
                  ) : null}
                </button>
              )
            })}
          </div>
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
