'use client'

import type { ComponentProps, ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'

interface SettingSwitchRowProps extends Omit<
  ComponentProps<typeof Switch>,
  'id' | 'children'
> {
  id: string
  label: ReactNode
  description?: ReactNode
  info?: ReactNode
  children?: ReactNode
}

/** One consistent typography for every preference toggle. */
export function SettingSwitchRow({
  id,
  label,
  description,
  info,
  children,
  ...switchProps
}: SettingSwitchRowProps) {
  const descriptionId = description ? `${id}-description` : undefined
  return (
    <section className="space-y-1" data-slot="setting-switch-row">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-1">
          <label
            htmlFor={id}
            data-slot="setting-switch-label"
            className="text-sm font-normal"
          >
            {label}
          </label>
          {info}
        </div>
        <Switch id={id} aria-describedby={descriptionId} {...switchProps} />
      </div>
      {description && (
        <p
          id={descriptionId}
          data-slot="setting-switch-description"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      )}
      {children}
    </section>
  )
}
