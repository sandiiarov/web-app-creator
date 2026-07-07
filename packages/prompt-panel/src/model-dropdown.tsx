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
import { ChevronDown, Eye, Image as ImageIcon, Type } from 'lucide-react'
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
import { NvidiaIcon } from './nvidia-icon'
import { OpenaiIcon } from './openai-icon'
import { TencentIcon } from './tencent-icon'
import { XaiIcon } from './xai-icon'
import { XiaomiIcon } from './xiaomi-icon'

const MODEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'bytedance-seed/seedream-4.5': BytedanceIcon,
  'deepseek/deepseek-v4-pro': DeepseekIcon,
  'google/gemini-3.1-flash-lite-image': GeminiIcon,
  'minimax/minimax-m3': MinimaxIcon,
  'moonshotai/kimi-k2.7-code': KimiIcon,
  'nvidia/nemotron-3-ultra-550b-a55b': NvidiaIcon,
  'openai/gpt-image-2': OpenaiIcon,
  'tencent/hy3': TencentIcon,
  'x-ai/grok-imagine-image-quality': XaiIcon,
  'xiaomi/mimo-v2.5': XiaomiIcon,
  'z-ai/glm-5.2': GlmIcon,
  'z-ai/glm-5v-turbo': GlmIcon,
}

const ROLE_ORDER: LandingModelRole[] = ['text', 'image', 'vision']

const ROLE_META: Record<
  LandingModelRole,
  { Icon: ComponentType<{ className?: string }>; label: string }
> = {
  image: { Icon: ImageIcon, label: 'Image' },
  text: { Icon: Type, label: 'Text' },
  vision: { Icon: Eye, label: 'Vision' },
}

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
            const RoleIcon = ROLE_META[role].Icon
            return (
              <Tooltip key={role}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'flex items-center gap-1 px-1',
                      index > 0 && 'border-l border-border',
                    )}
                  >
                    <RoleIcon className="size-3" />
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
            const meta = ROLE_META[role]
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
                <meta.Icon />
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
              <DropdownMenuRadioItem key={option.id} value={option.id}>
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
