import * as React from 'react'

import { cn } from '#lib/utils'

// Visual style ported from t3code (apps/web/src/components/ui/input.tsx),
// flattened onto the bare input (no wrapper span): rounded-lg, subtle dark
// surface, inset highlight, 3px ring on focus.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-7.5 w-full min-w-0 rounded-none border border-input bg-background px-[calc(--spacing(3)-1px)] text-sm leading-7.5 text-foreground shadow-xs/5 ring-ring/24 transition-shadow outline-none not-dark:bg-clip-padding placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:shadow-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none aria-invalid:border-destructive/36 aria-invalid:shadow-none aria-invalid:ring-destructive/16 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/16 dark:bg-input/32 dark:aria-invalid:ring-destructive/24',
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  )
}

export { Input }
