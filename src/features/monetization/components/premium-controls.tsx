'use client'

import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsTrigger } from '@/components/ui/tabs'
import type { PremiumFeature } from '../lib/premium-access'
import { usePremiumAction } from './premium-gate'
import { PremiumMark } from './premium-mark'

type PremiumProps = { feature: PremiumFeature }

export function PremiumButton({
  feature,
  children,
  onClick,
  ...props
}: ComponentProps<typeof Button> & PremiumProps) {
  const premium = usePremiumAction()
  const t = useTranslations('Premium')
  return (
    <Button
      type="button"
      {...props}
      data-premium-feature={feature}
      aria-description={t('marker')}
      onClick={(event) => {
        if (!premium.requireAccess(feature)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        return onClick?.(event)
      }}
    >
      {children}
      <PremiumMark />
    </Button>
  )
}

export function PremiumLink({
  feature,
  children,
  onClick,
  ...props
}: ComponentProps<typeof Link> & PremiumProps) {
  const premium = usePremiumAction()
  const t = useTranslations('Premium')
  return (
    <Link
      {...props}
      data-premium-feature={feature}
      aria-description={t('marker')}
      onClick={(event) => {
        if (!premium.requireAccess(feature)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClick?.(event)
      }}
    >
      {children}
      <PremiumMark />
    </Link>
  )
}

export function PremiumSwitch({
  feature,
  onCheckedChange,
  ...props
}: ComponentProps<typeof Switch> & PremiumProps) {
  const premium = usePremiumAction()
  const t = useTranslations('Premium')
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <PremiumMark />
      <Switch
        {...props}
        data-premium-feature={feature}
        aria-description={t('marker')}
        onCheckedChange={(checked, details) => {
          if (checked && !premium.requireAccess(feature)) {
            details.cancel()
            return
          }
          onCheckedChange?.(checked, details)
        }}
      />
    </span>
  )
}

export function PremiumTab({
  feature,
  children,
  ...props
}: ComponentProps<typeof TabsTrigger> & PremiumProps) {
  const t = useTranslations('Premium')
  return (
    <TabsTrigger
      {...props}
      data-premium-feature={feature}
      aria-description={t('marker')}
    >
      {children}
      <PremiumMark />
    </TabsTrigger>
  )
}

export function PremiumTabs({
  featureByValue,
  exemptValues = [],
  onValueChange,
  ...props
}: ComponentProps<typeof Tabs> & {
  featureByValue: Readonly<Record<string, PremiumFeature>>
  exemptValues?: readonly string[]
}) {
  const premium = usePremiumAction()
  return (
    <Tabs
      {...props}
      onValueChange={(value, details) => {
        const feature =
          typeof value === 'string' ? featureByValue[value] : undefined
        if (
          feature &&
          !exemptValues.includes(String(value)) &&
          !premium.requireAccess(feature)
        ) {
          details.cancel()
          return
        }
        onValueChange?.(value, details)
      }}
    />
  )
}

export function PremiumField({
  feature,
  label,
  children,
}: PremiumProps & { label: ReactNode; children: ReactNode }) {
  const premium = usePremiumAction()
  return (
    <fieldset className="space-y-2" data-premium-feature={feature}>
      <legend className="inline-flex items-center gap-2 text-sm font-semibold">
        {label}
        <PremiumMark />
      </legend>
      {premium.canUse(feature) ? (
        children
      ) : (
        <PremiumButton feature={feature} variant="outline">
          {label}
        </PremiumButton>
      )}
    </fieldset>
  )
}
