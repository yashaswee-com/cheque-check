import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Label } from '@/components/ui/label'

export function AuthFieldLabel({
  htmlFor,
  icon,
  children,
}: {
  htmlFor: string
  icon: ComponentProps<typeof HugeiconsIcon>['icon']
  children: ReactNode
}) {
  return (
    <Label htmlFor={htmlFor}>
      <HugeiconsIcon
        icon={icon}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {children}
    </Label>
  )
}
