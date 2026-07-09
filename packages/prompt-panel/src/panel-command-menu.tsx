import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import {
  AppWindow,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  Settings,
  Smartphone,
  Sun,
  Tablet,
} from 'lucide-react'
import { useState } from 'react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import type {
  PanelLayout,
  PanelTheme,
  PreviewViewport,
} from './panel-constants'
import { PREVIEW_VIEWPORTS } from './panel-constants'

const PANEL_LAYOUT_LABELS: Record<PanelLayout, string> = {
  floating: 'Floating',
  'left-sidebar': 'Left sidebar',
  'right-sidebar': 'Right sidebar',
}

const PREVIEW_VIEWPORT_LABELS: Record<PreviewViewport, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
}

export function PanelLayoutMenu({
  layout,
  onLayoutChange,
  onOpenChange,
  open,
}: {
  layout: PanelLayout
  onLayoutChange: (layout: PanelLayout) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const selectLayout = (nextLayout: PanelLayout) => {
    onLayoutChange(nextLayout)
    onOpenChange(false)
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <Tooltip open={open ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Open panel layout menu. Current layout: ${PANEL_LAYOUT_LABELS[layout]}.`}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PanelsTopLeft />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Panel</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onKeyDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => selectLayout('left-sidebar')}>
            <PanelLeft />
            Left sidebar
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutLeft}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selectLayout('right-sidebar')}>
            <PanelRight />
            Right sidebar
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutRight}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selectLayout('floating')}>
            <AppWindow />
            Floating
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutFloating}
            />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PanelSettingsMenu({
  onToggleTheme,
  theme,
}: {
  onToggleTheme: () => void
  theme: PanelTheme
}) {
  const [open, setOpen] = useState(false)
  const ThemeIcon = themeToggleIcon(theme)

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tooltip open={open ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open panel settings"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onKeyDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onToggleTheme}>
            <ThemeIcon />
            Toggle theme
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.themeToggle}
            />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PreviewViewportMenu({
  onViewportChange,
  viewport,
}: {
  onViewportChange: (viewport: PreviewViewport) => void
  viewport: PreviewViewport
}) {
  const [open, setOpen] = useState(false)
  const TriggerIcon = previewViewportIcon(viewport)

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tooltip open={open ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Preview viewport. Current: ${PREVIEW_VIEWPORT_LABELS[viewport]}.`}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <TriggerIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Viewport · {PREVIEW_VIEWPORT_LABELS[viewport]}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onKeyDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <DropdownMenuGroup>
          {PREVIEW_VIEWPORTS.map((nextViewport) => {
            const Icon = previewViewportIcon(nextViewport)
            return (
              <DropdownMenuItem
                key={nextViewport}
                onSelect={() => onViewportChange(nextViewport)}
              >
                <Icon />
                {PREVIEW_VIEWPORT_LABELS[nextViewport]}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function previewViewportIcon(viewport: PreviewViewport) {
  if (viewport === 'mobile') return Smartphone
  if (viewport === 'tablet') return Tablet
  return Monitor
}

function themeToggleIcon(theme: PanelTheme) {
  if (theme === 'dark') return Sun
  if (theme === 'light') return Moon

  return Monitor
}
