import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'

type Icon = ComponentProps<typeof HugeiconsIcon>['icon']

export function AuthFieldLabel({
  htmlFor,
  icon,
  required,
  className,
  children,
}: {
  htmlFor: string
  icon: Icon
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Label htmlFor={htmlFor} required={required} className={className}>
      <HugeiconsIcon
        icon={icon}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {children}
    </Label>
  )
}

/** Class names for an input placed inside an `AuthField` box. */
export const AUTH_FIELD_INPUT_CLASS =
  'h-11 rounded-none border-none bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent'

/**
 * Case-file style field: the label sits in a folder tab whose right edge
 * slants down into an outlined box that holds the control.
 */
export function AuthField({
  htmlFor,
  icon,
  label,
  required,
  error,
  errorId,
  action,
  children,
}: {
  htmlFor: string
  icon: Icon
  label: ReactNode
  required?: boolean
  error?: ReactNode
  errorId?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="group/field space-y-1">
      <div className="flex items-end justify-between gap-2">
        <div
          data-slot="auth-field-tab"
          className={cn(
            'relative z-10 -mb-px inline-block max-w-[85%] rounded-tl-md pl-px pt-px transition-colors [clip-path:polygon(0_0,calc(100%-14px)_0,100%_100%,0_100%)]',
            error
              ? 'bg-destructive/60'
              : 'bg-primary/25 group-focus-within/field:bg-primary/70',
          )}
        >
          <div className="flex h-7 items-center rounded-tl-[5px] bg-white pl-2.5 pr-6 [clip-path:polygon(0_0,calc(100%-15px)_0,calc(100%-1.5px)_100%,0_100%)] dark:bg-surface-tile-1">
            <AuthFieldLabel
              htmlFor={htmlFor}
              icon={icon}
              required={required}
              className="text-xs font-normal"
            >
              {label}
            </AuthFieldLabel>
          </div>
        </div>
        {action ? <div className="pb-1.5">{action}</div> : null}
      </div>
      <div
        data-slot="auth-field-box"
        className={cn(
          'rounded-b-md rounded-tr-md border bg-white shadow-sm transition-colors dark:bg-surface-tile-1',
          error
            ? 'border-destructive/60'
            : 'border-primary/25 group-focus-within/field:border-primary/70',
        )}
      >
        {children}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
