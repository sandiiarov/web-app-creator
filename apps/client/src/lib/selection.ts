import type { SelectedElement } from './agent'

export function selectedElementLabel(selection: SelectedElement) {
  const source = selection.source
  const sourceLabel = source
    ? `${source.fileName}${source.lineNumber ? `:${source.lineNumber}` : ''}`
    : '/src/App.tsx'
  const target = selection.componentName ?? selection.element.tagName

  return `Selected ${target} at ${sourceLabel}`
}

export function selectionButtonClassName(isSelectionMode: boolean) {
  return [
    'rounded-full border px-3 py-1.5 font-medium transition',
    isSelectionMode
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-muted text-muted-foreground hover:text-foreground',
  ].join(' ')
}
