export type KeyboardShortcut = {
  display: string
  hotkey?: string
  key?: string
  keys: readonly KeyboardShortcutKey[]
  title: string
}

export type KeyboardShortcutKey =
  | 'a'
  | 'command'
  | 'd'
  | 'enter'
  | 'escape'
  | 'f'
  | 'l'
  | 'm'
  | 'option'
  | 'p'
  | 'r'
  | 'shift'

export const KEYBOARD_SHORTCUTS = {
  allProjects: {
    display: 'Command Option A',
    hotkey: 'meta+alt+a,ctrl+alt+a',
    keys: ['command', 'option', 'a'],
    title: 'Command or Control Option A',
  },
  layoutFloating: {
    display: 'Option Shift F',
    hotkey: 'alt+shift+f',
    keys: ['option', 'shift', 'f'],
    title: 'Option Shift F',
  },
  layoutLeft: {
    display: 'Option Shift L',
    hotkey: 'alt+shift+l',
    keys: ['option', 'shift', 'l'],
    title: 'Option Shift L',
  },
  layoutRight: {
    display: 'Option Shift R',
    hotkey: 'alt+shift+r',
    keys: ['option', 'shift', 'r'],
    title: 'Option Shift R',
  },
  panelCommand: {
    display: 'Command Shift P',
    hotkey: 'meta+shift+p,ctrl+shift+p',
    keys: ['command', 'shift', 'p'],
    title: 'Command or Control Shift P',
  },
  panelToggle: {
    display: 'Option M',
    hotkey: 'alt+m',
    keys: ['option', 'm'],
    title: 'Option M',
  },
  send: {
    display: 'Command Enter',
    hotkey: 'ctrl+enter,meta+enter',
    keys: ['command', 'enter'],
    title: 'Control or Command Enter',
  },
  stop: {
    display: 'Escape',
    hotkey: 'esc,ctrl+.,meta+.',
    keys: ['escape'],
    title: 'Escape or Control/Command period',
  },
  themeToggle: {
    display: 'Command D',
    hotkey: 'meta+d,ctrl+d',
    key: 'd',
    keys: ['command', 'd'],
    title: 'Control or Command D',
  },
} as const satisfies Record<string, KeyboardShortcut>
