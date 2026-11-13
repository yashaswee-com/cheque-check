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
        className="ml-1 text-xs font-normal uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      <div className="relative min-w-0">
        <Input
          id={id}
          leftIcon={icon}
          enableMic={false}
          readOnly
          value={value}
          placeholder={placeholder}
          className={`h-14 rounded-sm border-none bg-canvas-parchment text-base font-normal dark:bg-surface-tile-1 ${verified ? 'pr-32' : 'pr-3'}`}
        />
        {verified && (
          <Badge
            data-testid={`${testId}-verified`}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
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
