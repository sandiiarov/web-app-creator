import { Button } from '@workspace/ui/components/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@workspace/ui/components/command'
import {
  DropdownMenu,
  DropdownMenuContent,
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
  Command as CommandIcon,
  FolderOpen,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Sun,
} from 'lucide-react'

import { useTheme } from '#components/theme-provider'

import { KEYBOARD_SHORTCUTS } from '../../lib/keyboard-shortcuts'
import { KeyboardShortcut } from './keyboard-shortcut'
import type { PanelLayout } from './panel-constants'

export function PanelCommandMenu({
  layout,
  onAllProjects,
  onLayoutChange,
  onOpenChange,
  open,
}: {
  layout: PanelLayout
  onAllProjects: () => void
  onLayoutChange: (layout: PanelLayout) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { setTheme, theme } = useTheme()

  const runCommand = (command: () => void) => {
    command()
    onOpenChange(false)
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Open panel command menu. Shortcut ${KEYBOARD_SHORTCUTS.panelCommand.title}`}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <CommandIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Panel commands
            <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.panelCommand} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={6}>
        <Command
          className="bg-transparent"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <CommandInput autoFocus placeholder="Search panel commands..." />
          <CommandList>
            <CommandEmpty>No command found.</CommandEmpty>
            <CommandGroup heading="Navigate">
              <CommandItem
                onSelect={() => runCommand(onAllProjects)}
                value="all projects project list home"
              >
                <FolderOpen />
                All projects
                <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.allProjects} />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Panel">
              <CommandItem
                data-checked={layout === 'left-sidebar'}
                onSelect={() =>
                  runCommand(() => onLayoutChange('left-sidebar'))
                }
                value="left sidebar panel layout"
              >
                <PanelLeft />
                Left sidebar
                <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.layoutLeft} />
              </CommandItem>
              <CommandItem
                data-checked={layout === 'right-sidebar'}
                onSelect={() =>
                  runCommand(() => onLayoutChange('right-sidebar'))
                }
                value="right sidebar panel layout"
              >
                <PanelRight />
                Right sidebar
                <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.layoutRight} />
              </CommandItem>
              <CommandItem
                data-checked={layout === 'floating'}
                onSelect={() => runCommand(() => onLayoutChange('floating'))}
                value="floating panel layout"
              >
                <AppWindow />
                Floating
                <KeyboardShortcut
                  shortcut={KEYBOARD_SHORTCUTS.layoutFloating}
                />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Theme">
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    setTheme(
                      document.documentElement.classList.contains('dark')
                        ? 'light'
                        : 'dark',
                    )
                  })
                }
                value="toggle theme dark light"
              >
                {theme === 'dark' ? (
                  <Sun />
                ) : theme === 'light' ? (
                  <Moon />
                ) : (
                  <Monitor />
                )}
                Toggle theme
                <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.themeToggle} />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
