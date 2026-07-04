import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { type ComponentType } from 'react'

import { LANDING_MODEL_OPTIONS } from './domain'
import { GlmIcon } from './glm-icon'
import { KimiIcon } from './kimi-icon'

const MODEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'moonshotai/Kimi-K2.7-Code': KimiIcon,
  'zai-org/GLM-5.2': GlmIcon,
}

export function ModelDropdown({
  model,
  onModelChange,
}: {
  model: string
  onModelChange: (model: string) => void
}) {
  const selectedModelLabel =
    LANDING_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Select model. Current model ${selectedModelLabel}`}
          className="max-w-44 justify-start"
          size="xs"
          type="button"
          variant="outline"
        >
          <span className="truncate">{selectedModelLabel}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" sideOffset={6}>
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={onModelChange} value={model}>
          {LANDING_MODEL_OPTIONS.map((option) => {
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
