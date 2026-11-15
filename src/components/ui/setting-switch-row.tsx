'use client'

import type { ComponentProps, ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { SwitchWithState } from '@/components/ui/switch-with-state'

interface SettingSwitchRowProps extends Omit<
  ComponentProps<typeof Switch>,
  'id' | 'children'
> {
  id: string
  label: ReactNode
  description?: ReactNode
  /** What turning the switch on or off will do, shown for the current state. */
  consequence?: { on: ReactNode; off: ReactNode }
  info?: ReactNode
  children?: ReactNode
}

/** One consistent typography for every preference toggle. */
export function SettingSwitchRow({
  id,
  label,
  description,
  consequence,
  info,
  children,
  ...switchProps
}: SettingSwitchRowProps) {
  const descriptionId = description ? `${id}-description` : undefined
  const consequenceId = consequence ? `${id}-consequence` : undefined
  const describedBy =
    [descriptionId, consequenceId].filter(Boolean).join(' ') || undefined
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
        <SwitchWithState
          id={id}
          aria-describedby={describedBy}
          {...switchProps}
        />
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
      {consequence && (
        <p
          id={consequenceId}
          aria-live="polite"
          data-slot="setting-switch-consequence"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {switchProps.checked ? consequence.on : consequence.off}
        </p>
      )}
      {children}
    </section>
  )
}
