import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '#lib/utils'

// Recipe ported from t3code (apps/web/src/components/ui/button.tsx), adapted
// from Base UI to Radix Slot: rounded controls with inset highlight shadows,
// ring-offset focus, muted-foreground icons on quiet variants. Density uses
// t3code's desktop (sm:) values — this is a desktop-only app.
const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--control-radius)] border text-sm font-medium whitespace-nowrap transition-shadow outline-none [--control-icon-color:currentColor] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-[var(--control-icon-color)]",
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-8 px-[calc(--spacing(3)-1px)]',
        icon: 'size-8',
        'icon-lg': 'size-9',
        'icon-sm': 'size-7',
        'icon-xl': "size-10 [&_svg:not([class*='size-'])]:size-4.5",
        'icon-xs':
          "size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 px-[calc(--spacing(3.5)-1px)]',
        sm: 'h-7 gap-1.5 px-[calc(--spacing(2.5)-1px)]',
        xl: "h-10 px-[calc(--spacing(4)-1px)] text-base [&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-6 gap-1 px-[calc(--spacing(2)-1px)] text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/24 not-disabled:inset-shadow-[0_1px_--theme(--color-white/16%)] hover:bg-primary/90 active:bg-primary/90 active:inset-shadow-[0_1px_--theme(--color-black/8%)] [:disabled,:active]:shadow-none',
        destructive:
          'border-destructive bg-destructive text-white shadow-xs shadow-destructive/24 not-disabled:inset-shadow-[0_1px_--theme(--color-white/16%)] hover:bg-destructive/90 active:bg-destructive/90 active:inset-shadow-[0_1px_--theme(--color-black/8%)] [:disabled,:active]:shadow-none',
        'destructive-outline':
          'border-input bg-popover text-destructive-foreground shadow-xs/5 not-dark:bg-clip-padding not-disabled:not-active:before:shadow-[0_1px_--theme(--color-black/4%)] hover:border-destructive/32 hover:bg-destructive/4 active:border-destructive/32 active:bg-destructive/4 dark:bg-input/32 dark:not-disabled:before:shadow-[0_-1px_--theme(--color-white/2%)] dark:not-disabled:not-active:before:shadow-[0_-1px_--theme(--color-white/6%)] [:disabled,:active]:shadow-none',
        ghost:
          'border-transparent text-foreground [--control-icon-color:var(--muted-foreground)] hover:bg-accent active:bg-accent aria-expanded:bg-accent',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
        outline:
          'border-input bg-popover text-foreground shadow-xs/5 [--control-icon-color:var(--muted-foreground)] not-dark:bg-clip-padding not-disabled:not-active:before:shadow-[0_1px_--theme(--color-black/4%)] hover:bg-accent/50 active:bg-accent/50 aria-expanded:bg-accent/50 dark:bg-input/32 dark:not-disabled:before:shadow-[0_-1px_--theme(--color-white/2%)] dark:not-disabled:not-active:before:shadow-[0_-1px_--theme(--color-white/6%)] dark:hover:bg-input/64 dark:active:bg-input/64 [:disabled,:active]:shadow-none',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/80',
      },
    },
  },
)

function Button({
  asChild = false,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  )
}

export { Button, buttonVariants }
