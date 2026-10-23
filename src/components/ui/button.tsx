'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import React from 'react'

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
  loading: loadingProp,
  loadingText,
  spinnerPosition = 'start',
  disabled,
  onClick,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
    loadingText?: React.ReactNode
    spinnerPosition?: 'start' | 'end'
  }) {
  const isNativeButton =
    nativeButton ??
    (!render ||
      (React.isValidElement(render) &&
        (render.type === 'button' || render.type === Button)))
  const loading = loadingProp ?? false
  const iconOnly = size === 'icon' || size === 'icon-sm'
  const spinner = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 animate-spin motion-reduce:animate-none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity=".25"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )

  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      nativeButton={isNativeButton}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    >
      {loadingProp === undefined && loadingText === undefined ? (
        children
      ) : iconOnly ? (
        <span className="inline-grid items-center justify-items-center">
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex',
              loading && 'invisible',
            )}
            aria-hidden={loading || undefined}
          >
            {children}
          </span>
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex',
              !loading && 'invisible',
            )}
            aria-hidden="true"
          >
            {spinner}
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center justify-center gap-1.5">
          {spinnerPosition === 'start' && (
            <span
              aria-hidden="true"
              className={cn('inline-flex', !loading && 'invisible')}
            >
              {spinner}
            </span>
          )}
          <span className="inline-grid items-center justify-items-center">
            <span
              className={cn(
                'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5',
                loading && loadingText != null && 'invisible',
              )}
              aria-hidden={(loading && loadingText != null) || undefined}
            >
              {children}
            </span>
            {loadingText != null && (
              <span
                className={cn(
                  'col-start-1 row-start-1',
                  !loading && 'invisible',
                )}
                aria-hidden={!loading || undefined}
              >
                {loadingText}
              </span>
            )}
          </span>
          {spinnerPosition === 'end' && (
            <span
              aria-hidden="true"
              className={cn('inline-flex', !loading && 'invisible')}
            >
              {spinner}
            </span>
          )}
        </span>
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
