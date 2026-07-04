import { createCodePlugin } from '@streamdown/code'
import { cn } from '@workspace/ui/lib/utils'
import { Streamdown, type ControlsConfig } from 'streamdown'

const streamdownCodeThemes: ['catppuccin-latte', 'catppuccin-mocha'] = [
  'catppuccin-latte',
  'catppuccin-mocha',
]
const streamdownCode = createCodePlugin({ themes: streamdownCodeThemes })

const baseClasses = [
  'streamdown-panel-content max-w-none min-w-0 text-xs leading-relaxed wrap-break-word',
  'text-muted-foreground',
]

const textElementClasses = [
  '[&_[data-streamdown=strong]]:font-semibold [&_[data-streamdown=strong]]:text-foreground',
  '[&_[data-streamdown=link]]:text-foreground [&_[data-streamdown=link]]:underline [&_[data-streamdown=link]]:decoration-border [&_[data-streamdown=link]]:underline-offset-3 [&_[data-streamdown=link]:hover]:decoration-foreground',
  '[&_[data-streamdown=inline-code]]:border [&_[data-streamdown=inline-code]]:border-border/70 [&_[data-streamdown=inline-code]]:bg-muted/45 [&_[data-streamdown=inline-code]]:px-1 [&_[data-streamdown=inline-code]]:py-0.5 [&_[data-streamdown=inline-code]]:font-mono [&_[data-streamdown=inline-code]]:text-[0.9em] [&_[data-streamdown=inline-code]]:text-foreground',
  '[&_p]:my-1.5',
]

const headingClasses = [
  '[&_[data-streamdown=heading-1]]:mt-3 [&_[data-streamdown=heading-1]]:mb-1.5 [&_[data-streamdown=heading-1]]:border-b [&_[data-streamdown=heading-1]]:border-border/60 [&_[data-streamdown=heading-1]]:pb-1 [&_[data-streamdown=heading-1]]:text-sm [&_[data-streamdown=heading-1]]:font-semibold [&_[data-streamdown=heading-1]]:text-foreground',
  '[&_[data-streamdown=heading-2]]:mt-3 [&_[data-streamdown=heading-2]]:mb-1 [&_[data-streamdown=heading-2]]:text-xs [&_[data-streamdown=heading-2]]:font-semibold [&_[data-streamdown=heading-2]]:text-foreground',
  '[&_[data-streamdown=heading-3]]:mt-2.5 [&_[data-streamdown=heading-3]]:mb-1 [&_[data-streamdown=heading-3]]:text-xs [&_[data-streamdown=heading-3]]:font-medium [&_[data-streamdown=heading-3]]:text-foreground',
  '[&_[data-streamdown=heading-4]]:mt-2 [&_[data-streamdown=heading-4]]:text-[11px] [&_[data-streamdown=heading-4]]:font-medium [&_[data-streamdown=heading-4]]:text-foreground',
  '[&_[data-streamdown=heading-5]]:mt-2 [&_[data-streamdown=heading-5]]:text-[11px] [&_[data-streamdown=heading-5]]:font-medium [&_[data-streamdown=heading-5]]:text-muted-foreground',
  '[&_[data-streamdown=heading-6]]:mt-2 [&_[data-streamdown=heading-6]]:text-[10px] [&_[data-streamdown=heading-6]]:font-semibold [&_[data-streamdown=heading-6]]:tracking-[0.08em] [&_[data-streamdown=heading-6]]:text-muted-foreground [&_[data-streamdown=heading-6]]:uppercase',
]

const listAndBlockClasses = [
  '[&_[data-streamdown=ordered-list]]:my-2 [&_[data-streamdown=ordered-list]]:list-decimal [&_[data-streamdown=ordered-list]]:pl-5',
  '[&_[data-streamdown=unordered-list]]:my-2 [&_[data-streamdown=unordered-list]]:list-disc [&_[data-streamdown=unordered-list]]:pl-5',
  '[&_[data-streamdown=list-item]]:my-0.5 [&_[data-streamdown=list-item]]:pl-0.5',
  '[&_[data-streamdown=blockquote]]:my-2 [&_[data-streamdown=blockquote]]:border-l-2 [&_[data-streamdown=blockquote]]:border-primary/55 [&_[data-streamdown=blockquote]]:bg-muted/25 [&_[data-streamdown=blockquote]]:px-2 [&_[data-streamdown=blockquote]]:py-1.5 [&_[data-streamdown=blockquote]]:text-muted-foreground',
  '[&_[data-streamdown=horizontal-rule]]:my-3 [&_[data-streamdown=horizontal-rule]]:border-border/60',
]

const codeClasses = [
  '[&_[data-streamdown=code-block]]:relative [&_[data-streamdown=code-block]]:my-2 [&_[data-streamdown=code-block]]:gap-0 [&_[data-streamdown=code-block]]:overflow-hidden [&_[data-streamdown=code-block]]:rounded-none [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:border-border/70 [&_[data-streamdown=code-block]]:bg-background [&_[data-streamdown=code-block]]:p-0 [&_[data-streamdown=code-block]]:shadow-sm',
  '[&_[data-streamdown=code-block-header]]:h-6 [&_[data-streamdown=code-block-header]]:border-b [&_[data-streamdown=code-block-header]]:border-border/60 [&_[data-streamdown=code-block-header]]:bg-muted/35 [&_[data-streamdown=code-block-header]]:px-3 [&_[data-streamdown=code-block-header]]:font-mono [&_[data-streamdown=code-block-header]]:text-[10px] [&_[data-streamdown=code-block-header]]:font-semibold [&_[data-streamdown=code-block-header]]:tracking-[0.08em] [&_[data-streamdown=code-block-header]]:text-muted-foreground [&_[data-streamdown=code-block-header]]:uppercase [&_[data-streamdown=code-block-header][data-language=""]]:hidden',
  '[&_[data-streamdown=code-block-actions]]:hidden',
  '[&_[data-streamdown=code-block-body]]:overflow-auto [&_[data-streamdown=code-block-body]]:rounded-none [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-muted/25 [&_[data-streamdown=code-block-body]]:px-3 [&_[data-streamdown=code-block-body]]:py-2.5 [&_[data-streamdown=code-block-body]]:text-[11px]',
  '[&_[data-streamdown=code-block]_pre]:m-0 [&_[data-streamdown=code-block]_pre]:max-h-96 [&_[data-streamdown=code-block]_pre]:overflow-visible [&_[data-streamdown=code-block]_pre]:bg-transparent [&_[data-streamdown=code-block]_pre]:p-0',
  '[&_[data-streamdown=code-block]_code]:border-0 [&_[data-streamdown=code-block]_code]:bg-transparent [&_[data-streamdown=code-block]_code]:p-0 [&_[data-streamdown=code-block]_code]:font-mono [&_[data-streamdown=code-block]_code]:text-[11px] [&_[data-streamdown=code-block]_code]:leading-5',
  '[&_[data-streamdown=code-block]_code>span]:block',
  '[&_[data-streamdown=code-block]_[class*=rounded]]:rounded-none',
  '[&_[data-streamdown=mermaid-block]]:my-2 [&_[data-streamdown=mermaid-block]]:border [&_[data-streamdown=mermaid-block]]:border-border/70 [&_[data-streamdown=mermaid-block]]:bg-muted/20 [&_[data-streamdown=mermaid-block]]:p-2',
]

const tableClasses = [
  '[&_[data-streamdown=table-wrapper]]:my-2 [&_[data-streamdown=table-wrapper]]:max-w-full [&_[data-streamdown=table-wrapper]]:overflow-x-auto [&_[data-streamdown=table-wrapper]]:border [&_[data-streamdown=table-wrapper]]:border-border/70 [&_[data-streamdown=table-wrapper]]:bg-background/70',
  '[&_[data-streamdown=table]]:w-full [&_[data-streamdown=table]]:min-w-max [&_[data-streamdown=table]]:border-collapse [&_[data-streamdown=table]]:text-[11px]',
  '[&_[data-streamdown=table-header]]:bg-muted/55 [&_[data-streamdown=table-header]]:text-foreground',
  '[&_[data-streamdown=table-header-cell]]:border-b [&_[data-streamdown=table-header-cell]]:border-border/70 [&_[data-streamdown=table-header-cell]]:px-2 [&_[data-streamdown=table-header-cell]]:py-1.5 [&_[data-streamdown=table-header-cell]]:text-left [&_[data-streamdown=table-header-cell]]:font-semibold',
  '[&_[data-streamdown=table-cell]]:border-t [&_[data-streamdown=table-cell]]:border-border/45 [&_[data-streamdown=table-cell]]:px-2 [&_[data-streamdown=table-cell]]:py-1.5 [&_[data-streamdown=table-cell]]:align-top',
  '[&_[data-streamdown=table-row]:nth-child(even)]:bg-muted/20',
]

const thinkingClasses = [
  'text-[11px] text-muted-foreground/80',
  '[&_p]:my-1',
  '[&_[data-streamdown=heading-1]]:text-xs [&_[data-streamdown=heading-2]]:text-[11px]',
]

const streamdownControls: ControlsConfig = {
  code: { copy: false, download: false },
  mermaid: false,
  table: false,
}

export function StreamdownContent({
  children,
  className,
  isStreaming,
  variant = 'assistant',
}: {
  children: string
  className?: string
  isStreaming: boolean
  variant?: 'assistant' | 'thinking'
}) {
  return (
    <Streamdown
      animated={false}
      className={cn(
        baseClasses,
        textElementClasses,
        headingClasses,
        listAndBlockClasses,
        codeClasses,
        tableClasses,
        variant === 'thinking' && thinkingClasses,
        className,
      )}
      controls={streamdownControls}
      isAnimating={isStreaming}
      lineNumbers={false}
      mode={isStreaming ? 'streaming' : 'static'}
      parseIncompleteMarkdown={isStreaming}
      plugins={{ code: streamdownCode }}
      shikiTheme={streamdownCodeThemes}
    >
      {children}
    </Streamdown>
  )
}
