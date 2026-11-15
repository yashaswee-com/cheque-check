'use client'

import type { ComponentProps } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type SwitchWithStateProps = ComponentProps<typeof Switch> & {
  stateClassName?: string
}

/** A switch with a visible On/Off word so its state never relies on colour alone. */
export function SwitchWithState({
  checked,
  stateClassName,
  ...props
}: SwitchWithStateProps) {
  const t = useTranslations('Common')
  return (
    <span
      data-slot="switch-with-state"
      className="inline-flex shrink-0 items-center gap-2"
    >
      {/* The switch role already announces its state; this word is visual only. */}
      <span
        aria-hidden="true"
        data-slot="switch-state"
        data-state={checked ? 'on' : 'off'}
        className={cn(
          'min-w-6 text-right text-xs font-medium',
          checked ? 'text-primary' : 'text-muted-foreground',
          stateClassName,
        )}
      >
        {checked ? t('switchOn') : t('switchOff')}
      </span>
      <Switch checked={checked} {...props} />
    </span>
  )
}
