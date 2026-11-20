import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { FormLabel } from '@/components/ui/form-label'
import { FieldError } from '@/components/ui/field-error'

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
    <FormLabel
      htmlFor={htmlFor}
      icon={icon}
      is_required={required}
      className={className}
    >
      {children}
    </FormLabel>
  )
}

/** Class names for an input placed inside an `AuthField` box. */
export const AUTH_FIELD_INPUT_CLASS =
  'h-11 rounded-md border-input bg-background px-3 shadow-none'

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <AuthFieldLabel
          htmlFor={htmlFor}
          icon={icon}
          required={required}
          className="text-xs font-normal"
        >
          {label}
        </AuthFieldLabel>
        {action ? <div className="pb-1.5">{action}</div> : null}
      </div>
      <div data-slot="auth-field-box">{children}</div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
