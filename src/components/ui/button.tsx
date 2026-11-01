'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import React from 'react'
import { Spinner } from './spinner'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-95 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 gap-1.5 px-4',
        xs: 'h-6 gap-1 px-2 text-xs',
        sm: 'h-8 gap-1 px-3 text-sm',
        lg: 'h-12 gap-1.5 px-6 text-base',
        pill: 'h-11 rounded-full px-6 text-base',
        icon: 'size-10 rounded-full',
        'icon-sm': 'size-8 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  render,
  nativeButton,
  children,
  loading: isLoadingProp,
  disabled,
  onClick,
  ...props
}: Omit<ButtonPrimitive.Props, 'onClick'> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
    onClick?: (
      event: Parameters<NonNullable<ButtonPrimitive.Props['onClick']>>[0],
    ) => unknown
  }) {
  const [isPending, setIsPending] = React.useState(false)
  const isPendingRef = React.useRef(false)
  const isNativeButton =
    nativeButton ??
    (!render ||
      (React.isValidElement(render) &&
        (render.type === 'button' || render.type === Button)))
  const isLoading = !!isLoadingProp || isPending

  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      nativeButton={isNativeButton}
      className={cn('relative', buttonVariants({ variant, size, className }))}
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onClick={(event) => {
        if (isLoading || isPendingRef.current) {
          event.preventDefault()
          return
        }
        const result = onClick?.(event)
        if (
          result !== null &&
          (typeof result === 'object' || typeof result === 'function') &&
          'then' in result &&
          typeof result.then === 'function'
        ) {
          isPendingRef.current = true
          setIsPending(true)
          return Promise.resolve(result).finally(() => {
            isPendingRef.current = false
            setIsPending(false)
          })
        }
      }}
    >
      <span
        data-slot="button-content"
        className={cn(
          'inline-flex items-center justify-center [flex-direction:inherit] [gap:inherit]',
          isLoading && 'opacity-0',
        )}
      >
        {children}
      </span>
      {isLoading && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <Spinner />
        </span>
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
