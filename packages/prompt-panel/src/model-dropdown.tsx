import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState, type ComponentType } from 'react'

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
  'bytedance-seed/seed-2.0-mini': BytedanceIcon,
  'bytedance-seed/seedream-4.5': BytedanceIcon,
  'deepseek/deepseek-v4-flash:nitro': DeepseekIcon,
  'deepseek/deepseek-v4-pro:nitro': DeepseekIcon,
  'google/gemini-3.1-flash-lite-image': GeminiIcon,
  'minimax/minimax-m3': MinimaxIcon,
  'moonshotai/kimi-k2.7-code': KimiIcon,
  'moonshotai/kimi-k2.7-code:nitro': KimiIcon,
  'nvidia/nemotron-3-ultra-550b-a55b:nitro': NvidiaIcon,
  'openai/gpt-image-2': OpenaiIcon,
  'poolside/laguna-s-2.1:nitro': PoolsideIcon,
  'tencent/hy3:nitro': TencentIcon,
  'x-ai/grok-imagine-image-quality': XaiIcon,
  'xiaomi/mimo-v2.5': XiaomiIcon,
  'z-ai/glm-5.2:nitro': GlmIcon,
  'z-ai/glm-5v-turbo': GlmIcon,
}

const ROLE_ORDER: LandingModelRole[] = ['text', 'image', 'vision']

export interface ModelDropdownProps {
  models: LandingModels
  onModelsChange: (models: LandingModels) => void
}

/**
 * A model picker with one trigger showing all three role selections (text,
 * image, vision) and an in-menu segmented toggle that switches which role's
 * model list is shown below.
 */
export function ModelDropdown({ models, onModelsChange }: ModelDropdownProps) {
  const [activeRole, setActiveRole] = useState<LandingModelRole>('text')
  const activeGroup = LANDING_MODEL_GROUPS.find(
    (entry) => entry.role === activeRole,
  )!

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
              <Tooltip key={role}>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" sideOffset={6}>
        <div className="flex gap-0.5 p-1 pb-2">
          {ROLE_ORDER.map((role) => {
            const meta = MODEL_ROLE_META[role]
            const active = role === activeRole
            return (
              <Button
                aria-pressed={active}
                className={cn(
                  'flex-1 justify-center gap-1',
                  active && 'bg-accent text-accent-foreground',
                )}
                key={role}
                onClick={() => setActiveRole(role)}
                size="xs"
                type="button"
                variant="ghost"
              >
                <meta.Icon className={cn('size-3.5', meta.color)} />
                {meta.label}
              </Button>
            )
          })}
        </div>
        <DropdownMenuRadioGroup
          onValueChange={(value) =>
            onModelsChange({ ...models, [activeRole]: value })
          }
          value={models[activeRole]}
        >
          {activeGroup.options.map((option) => {
            const Icon = MODEL_ICONS[option.id]
            return (
              <DropdownMenuRadioItem
                key={option.id}
                onSelect={(event) => event.preventDefault()}
                value={option.id}
              >
                {Icon ? <Icon /> : null}
                {option.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function optionFor(role: LandingModelRole, modelId: string) {
  const group = LANDING_MODEL_GROUPS.find((entry) => entry.role === role)
  return group?.options.find((option) => option.id === modelId)
}
