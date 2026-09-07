'use client'

import { type VariantProps } from 'class-variance-authority'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { toggleVariants } from '#components/toggle'
import { cn } from '#lib/utils'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    orientation?: 'horizontal' | 'vertical'
    spacing?: number
  }
>({
  orientation: 'horizontal',
  size: 'default',
  spacing: 2,
  variant: 'default',
})

function ToggleGroup({
  children,
  className,
  orientation = 'horizontal',
  size,
  spacing = 2,
  variant,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    orientation?: 'horizontal' | 'vertical'
    spacing?: number
  }) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-none data-vertical:flex-col data-vertical:items-stretch',
        className,
      )}
      data-orientation={orientation}
      data-size={size}
      data-slot="toggle-group"
      data-spacing={spacing}
      data-variant={variant}
      orientation={orientation}
      style={{ '--gap': spacing } as React.CSSProperties}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ orientation, size, spacing, variant }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-none group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-none group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-none group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-none group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
        toggleVariants({
          size: context.size || size,
          variant: context.variant || variant,
        }),
        className,
      )}
      data-size={context.size || size}
      data-slot="toggle-group-item"
      data-spacing={context.spacing}
      data-variant={context.variant || variant}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
