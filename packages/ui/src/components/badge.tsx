import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '#lib/utils'

// Recipe ported from t3code (apps/web/src/components/ui/badge.tsx): compact
// rounded badges with tinted status variants. `ghost`/`link` kept for
// existing call sites (t3code has no equivalents).
const badgeVariants = cva(
  "group/badge relative inline-flex h-4.5 w-fit min-w-4.5 shrink-0 items-center justify-center gap-1 rounded-none border border-transparent px-[calc(--spacing(1)-1px)] text-xs font-medium whitespace-nowrap transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background [&>svg]:pointer-events-none [&>svg]:shrink-0 [&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-3",
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/90',
        destructive: 'bg-destructive text-white [a]:hover:bg-destructive/90',
        error:
          'bg-destructive/8 text-destructive-foreground dark:bg-destructive/16',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        info: 'bg-info/8 text-info-foreground dark:bg-info/16',
        link: 'text-primary underline-offset-4 hover:underline',
        outline:
          'border-input bg-background text-foreground dark:bg-input/32 [a]:hover:bg-accent/50 dark:[a]:hover:bg-input/48',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/90',
        success: 'bg-success/8 text-success-foreground dark:bg-success/16',
        warning: 'bg-warning/8 text-warning-foreground dark:bg-warning/16',
      },
    },
  },
)

function Badge({
  asChild = false,
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
