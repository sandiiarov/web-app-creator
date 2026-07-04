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
  TooltipProvider,
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
  Sun,
} from 'lucide-react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import type { PanelLayout, PanelTheme } from './panel-constants'

const PANEL_LAYOUT_LABELS: Record<PanelLayout, string> = {
  floating: 'Floating',
  'left-sidebar': 'Left sidebar',
  'right-sidebar': 'Right sidebar',
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
      <TooltipProvider>
        <Tooltip>
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
      </TooltipProvider>
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
  const ThemeIcon = themeToggleIcon(theme)

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
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
      </TooltipProvider>
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

function themeToggleIcon(theme: PanelTheme) {
  if (theme === 'dark') return Sun
  if (theme === 'light') return Moon

  return Monitor
}
