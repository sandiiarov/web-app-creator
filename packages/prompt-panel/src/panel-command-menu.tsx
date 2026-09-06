import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import {
  MOTION_PREFERENCES,
  useMotionPreference,
} from '@workspace/ui/lib/motion-preference'
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
import { useState, type ReactNode } from 'react'

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
  mobileExpanded,
  onLayoutChange,
  onMobileExpandedChange,
  onOpenChange,
  open,
}: {
  layout: PanelLayout
  mobileExpanded: boolean
  onLayoutChange: (layout: PanelLayout) => void
  onMobileExpandedChange: (value: boolean) => void
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
        <DropdownMenuRadioGroup
          className="md:hidden"
          onValueChange={(value) => {
            onMobileExpandedChange(value === 'expanded')
            onOpenChange(false)
          }}
          value={mobileExpanded ? 'expanded' : 'compact'}
        >
          <DropdownMenuRadioItem value="compact">
            Compact assistant
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="expanded">
            Expanded assistant
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuGroup className="hidden md:block">
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
  pageActions,
  theme,
}: {
  onToggleTheme: () => void
  pageActions: ReactNode
  theme: PanelTheme
}) {
  const [open, setOpen] = useState(false)
  const ThemeIcon = themeToggleIcon(theme)
  const [motion, setMotion] = useMotionPreference()

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
        {pageActions}
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
        <DropdownMenuSeparator />
        <div
          className="flex flex-col gap-3 p-2"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <label
            className="flex justify-between text-xs font-medium"
            htmlFor="workspace-motion"
          >
            Motion
            <span className="font-normal text-muted-foreground capitalize">
              {motion === 'none' ? 'Off' : motion}
            </span>
          </label>
          <input
            aria-valuetext={motion}
            className="w-full cursor-pointer accent-primary"
            id="workspace-motion"
            max={3}
            min={0}
            onChange={(event) =>
              setMotion(MOTION_PREFERENCES[Number(event.target.value)]!)
            }
            step={1}
            type="range"
            value={MOTION_PREFERENCES.indexOf(motion)}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Always respects your device’s reduced-motion setting.
          </p>
        </div>
        <DropdownMenuSeparator />
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
        <DropdownMenuRadioGroup
          onValueChange={(value) => onViewportChange(value as PreviewViewport)}
          value={viewport}
        >
          {PREVIEW_VIEWPORTS.map((nextViewport) => {
            const Icon = previewViewportIcon(nextViewport)
            return (
              <DropdownMenuRadioItem key={nextViewport} value={nextViewport}>
                <Icon />
                {PREVIEW_VIEWPORT_LABELS[nextViewport]}
                <span className="ml-auto text-xs text-muted-foreground">
                  {nextViewport === 'mobile'
                    ? '390px'
                    : nextViewport === 'tablet'
                      ? '768px'
                      : 'Full width'}
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
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
