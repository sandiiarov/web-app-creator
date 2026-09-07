import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { RangeSlider } from '@workspace/ui/components/range-slider'
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
  compactionPercent,
  layout,
  mobileExpanded,
  onCompactionPercentChange,
  onLayoutChange,
  onMobileExpandedChange,
  onToggleTheme,
  pageActions,
  theme,
}: {
  compactionPercent: number
  layout: PanelLayout
  mobileExpanded: boolean
  onCompactionPercentChange: (percent: number) => void
  onLayoutChange: (layout: PanelLayout) => void
  onMobileExpandedChange: (value: boolean) => void
  onToggleTheme: () => void
  pageActions: ReactNode
  theme: PanelTheme
}) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
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
        <TooltipContent side="bottom">Panel layout</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onKeyDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <DropdownMenuRadioGroup
          className="md:hidden"
          onValueChange={(value) =>
            onMobileExpandedChange(value === 'expanded')
          }
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
          <DropdownMenuItem onSelect={() => onLayoutChange('left-sidebar')}>
            <PanelLeft />
            Left sidebar
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutLeft}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onLayoutChange('right-sidebar')}>
            <PanelRight />
            Right sidebar
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutRight}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onLayoutChange('floating')}>
            <AppWindow />
            Floating
            <KeyboardShortcut
              className="ml-auto shrink-0"
              shortcut={KEYBOARD_SHORTCUTS.layoutFloating}
            />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {pageActions}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings />
              Settings
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60">
              <PanelSettingsContent
                compactionPercent={compactionPercent}
                onCompactionPercentChange={onCompactionPercentChange}
                onToggleTheme={onToggleTheme}
                theme={theme}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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

function PanelSettingsContent({
  compactionPercent,
  onCompactionPercentChange,
  onToggleTheme,
  theme,
}: {
  compactionPercent: number
  onCompactionPercentChange: (percent: number) => void
  onToggleTheme: () => void
  theme: PanelTheme
}) {
  const ThemeIcon = themeToggleIcon(theme)
  const [motion, setMotion] = useMotionPreference()

  return (
    <>
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
        <RangeSlider
          label="Motion"
          max={3}
          onValueChange={(value) => setMotion(MOTION_PREFERENCES[value]!)}
          value={MOTION_PREFERENCES.indexOf(motion)}
          valueLabel={
            motion === 'none'
              ? 'Off'
              : motion.charAt(0).toUpperCase() + motion.slice(1)
          }
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Always respects your device’s reduced-motion setting.
        </p>
      </div>
      <DropdownMenuSeparator />
      <details className="p-2" onKeyDown={(event) => event.stopPropagation()}>
        <summary className="cursor-pointer text-xs font-medium">
          Advanced
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Summarize older conversation when context fills up. Key decisions stay
          available to the assistant; your chat history stays visible.
        </p>
        <div className="mt-3">
          <RangeSlider
            label="Context used"
            max={100}
            min={1}
            onValueChange={onCompactionPercentChange}
            suffix="%"
            value={compactionPercent}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Lower values summarize sooner. Default: 80%.
        </p>
      </details>
    </>
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
