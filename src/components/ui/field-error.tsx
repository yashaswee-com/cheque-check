import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

/** Inline validation message with a leading error icon. Renders nothing when empty. */
export function FieldError({
  children,
  id,
  className,
}: {
  children?: ReactNode
  id?: string
  className?: string
}) {
  if (!children) return null
  return (
    <p
      id={id}
      role="alert"
      data-slot="field-error"
      className={cn(
        'ml-1 flex items-start gap-1 text-xs text-destructive',
        className,
      )}
    >
      <HugeiconsIcon
        icon={AlertCircleIcon}
        className="mt-px size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  )
}
