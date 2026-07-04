import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { type ComponentType } from 'react'

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
import { XaiIcon } from './xai-icon'

const MODEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'bytedance-seed/seedream-4.5': BytedanceIcon,
  'deepseek/deepseek-v4-pro': DeepseekIcon,
  'google/gemini-3.1-flash-lite-image': GeminiIcon,
  'minimax/minimax-m3': MinimaxIcon,
  'moonshotai/kimi-k2.7-code': KimiIcon,
  'nvidia/nemotron-3-ultra-550b-a55b': NvidiaIcon,
  'openai/gpt-image-2': OpenaiIcon,
  'x-ai/grok-imagine-image-quality': XaiIcon,
  'z-ai/glm-5.2': GlmIcon,
}

const ROLE_ORDER: LandingModelRole[] = ['text', 'image', 'vision']

export interface ModelDropdownProps {
  models: LandingModels
  onModelsChange: (models: LandingModels) => void
}

/**
 * A single dropdown listing every model the server supports, grouped by role
 * (text, image, vision). Each section is an independent selection bound to the
 * matching slot on `models`.
 */
export function ModelDropdown({ models, onModelsChange }: ModelDropdownProps) {
  const textLabel =
    LANDING_MODEL_GROUPS[0]!.options.find((option) => option.id === models.text)
      ?.label ?? models.text

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Models. Current text model ${textLabel}`}
          className="max-w-44 justify-start"
          size="xs"
          type="button"
          variant="outline"
        >
          <span className="truncate">{textLabel}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" sideOffset={6}>
        {ROLE_ORDER.map((role, index) => {
          const group = LANDING_MODEL_GROUPS.find(
            (entry) => entry.role === role,
          )!

          return (
            <div key={role}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  onModelsChange({ ...models, [role]: value })
                }
                value={models[role]}
              >
                {group.options.map((option) => {
                  const Icon = MODEL_ICONS[option.id]

                  return (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      {Icon ? <Icon /> : null}
                      {option.label}
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
