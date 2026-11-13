'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkBadge01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IconType } from '@/types'

export function ContactField({
  id,
  label,
  icon,
  value,
  placeholder,
  verified,
  testId,
  children,
}: {
  id: string
  label: string
  icon: IconType
  value: string
  placeholder: string
  verified: boolean
  testId: string
  children?: ReactNode
}) {
  const t = useTranslations('EmailLink')
  return (
    <section className="space-y-2" data-testid={testId}>
      <Label
        htmlFor={id}
        className="ml-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            id={id}
            leftIcon={icon}
            enableMic={false}
            readOnly
            value={value}
            placeholder={placeholder}
            className="h-14 rounded-sm border-none bg-canvas-parchment pr-3 text-base font-normal dark:bg-surface-tile-1"
          />
        </div>
        {verified && (
          <Badge
            data-testid={`${testId}-verified`}
            className="shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          >
            <HugeiconsIcon
              icon={CheckmarkBadge01Icon}
              data-icon="inline-start"
            />
            {t('verified')}
          </Badge>
        )}
      </div>
      {children}
    </section>
  )
}
