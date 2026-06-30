import { cn } from '@workspace/ui/lib/utils'
import { Streamdown } from 'streamdown'

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
        'min-w-0 max-w-none wrap-break-word text-xs leading-relaxed',
        '[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-3',
        '[&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_code]:border [&_code]:border-border/60 [&_code]:bg-muted/40 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_h1]:text-xs [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-medium',
        '[&_hr]:my-3 [&_hr]:border-border/60',
        '[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border/60 [&_td]:p-1.5 [&_th]:border [&_th]:border-border/60 [&_th]:p-1.5 [&_th]:text-left',
        variant === 'assistant' && 'text-muted-foreground',
        variant === 'thinking' && 'text-[11px] italic text-muted-foreground/75',
        className,
      )}
      controls={false}
      isAnimating={isStreaming}
      lineNumbers={false}
      mode={isStreaming ? 'streaming' : 'static'}
      parseIncompleteMarkdown={isStreaming}
    >
      {children}
    </Streamdown>
  )
}
