import { CommandShortcut } from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowBigUp, Command as CommandIcon, Option } from 'lucide-react'

import type {
  KeyboardShortcut as KeyboardShortcutDefinition,
  KeyboardShortcutKey,
} from '../../lib/keyboard-shortcuts'

const KEY_LABELS: Record<KeyboardShortcutKey, string> = {
  a: 'A',
  command: 'Command or Control',
  d: 'D',
  enter: 'Enter',
  escape: 'Escape',
  f: 'F',
  l: 'L',
  m: 'M',
  option: 'Option',
  p: 'P',
  r: 'R',
  shift: 'Shift',
}

export function KeyboardShortcut({
  className,
  shortcut,
}: {
  className?: string
  shortcut: KeyboardShortcutDefinition
}) {
  return (
    <CommandShortcut
      aria-label={shortcut.title}
      className={cn('flex items-center gap-1 tracking-normal', className)}
      title={shortcut.title}
    >
      {shortcut.keys.map((key) => (
        <ShortcutKey key={key} value={key} />
      ))}
    </CommandShortcut>
  )
}

function ShortcutKey({ value }: { value: KeyboardShortcutKey }) {
  if (value === 'command') {
    return (
      <CommandIcon
        aria-label={KEY_LABELS[value]}
        className="size-3"
        strokeWidth={2}
      />
    )
  }

  if (value === 'option') {
    return (
      <Option
        aria-label={KEY_LABELS[value]}
        className="size-3"
        strokeWidth={2}
      />
    )
  }

  if (value === 'shift') {
    return (
      <ArrowBigUp
        aria-label={KEY_LABELS[value]}
        className="size-3"
        strokeWidth={2}
      />
    )
  }

  return (
    <span className="font-mono text-[10px] leading-none tracking-normal">
      {value === 'enter' ? '↵' : KEY_LABELS[value]}
    </span>
  )
}
