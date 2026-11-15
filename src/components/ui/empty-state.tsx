import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

import { IconType } from '@/types'

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconType
  title: string
  description?: React.ReactNode
  /** Subtle, muted context: what was checked and what to try next. */
  detail?: React.ReactNode
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  illustration?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  detail,
  action,
  illustration,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in zoom-in duration-300',
        className,
      )}
      {...props}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 mb-6">
        {illustration ? (
          illustration
        ) : Icon ? (
          <HugeiconsIcon icon={Icon} className="h-10 w-10 text-primary/40" />
        ) : null}
      </div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-70 text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {detail && (
        <div
          data-slot="empty-state-detail"
          className="mx-auto mt-3 max-w-80 space-y-1 text-xs leading-relaxed text-muted-foreground/80"
        >
          {detail}
        </div>
      )}
      {action && (
        <div className="mt-6">
          {action.onClick ? (
            <Button onClick={action.onClick} className="rounded-full px-8">
              {action.label}
            </Button>
          ) : action.href ? (
            <Button
              render={<Link href={action.href} />}
              className="rounded-full px-8"
            >
              {action.label}
            </Button>
          ) : (
            <Button className="rounded-full px-8">{action.label}</Button>
          )}
        </div>
      )}
    </div>
  )
}
