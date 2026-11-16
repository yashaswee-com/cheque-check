import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { SquareAsteriskIcon } from '@hugeicons/core-free-icons'
import { Label } from '@/components/ui/label'

export type FormLabelProps = Omit<ComponentProps<typeof Label>, 'required'> & {
  icon: ComponentProps<typeof HugeiconsIcon>['icon']
  is_required?: boolean
}

export function FormLabel({
  icon,
  is_required = false,
  children,
  ...props
}: FormLabelProps) {
  return (
    <Label
      data-slot="form-label"
      data-required={is_required || undefined}
      {...props}
    >
      <HugeiconsIcon
        icon={icon}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {children}
      {is_required && (
        <HugeiconsIcon
          icon={SquareAsteriskIcon}
          data-slot="required-indicator"
          className="-ml-1 size-3 shrink-0 text-destructive"
          aria-hidden="true"
        />
      )}
    </Label>
  )
}
