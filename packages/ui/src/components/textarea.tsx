import * as React from 'react'

import { cn } from '#lib/utils'

// Matches the t3code-ported Input surface (rounded-lg, inset highlight, ring
// focus) with textarea sizing.
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-none border border-input bg-background px-[calc(--spacing(3)-1px)] py-2 text-sm text-foreground shadow-xs/5 ring-ring/24 transition-shadow outline-none not-dark:bg-clip-padding placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:shadow-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-64 disabled:shadow-none aria-invalid:border-destructive/36 aria-invalid:shadow-none aria-invalid:ring-destructive/16 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/16 dark:bg-input/32 dark:aria-invalid:ring-destructive/24',
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  )
}

export { Textarea }
