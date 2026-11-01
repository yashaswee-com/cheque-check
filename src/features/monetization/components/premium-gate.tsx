'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { usePremiumAccess } from '../hooks/use-premium-access'
import type { PremiumFeature } from '../lib/premium-access'
import { toast } from '@/components/ui/toast'
import { verifyLifetimePremium } from '../services/premium-authorization'
import { usePremiumPrompt } from './premium-prompt'
import { PremiumMark } from './premium-mark'

export function PremiumGate({
  feature,
  children,
  testId = 'premium-gate',
}: {
  feature: PremiumFeature
  children: ReactNode
  testId?: string
}) {
  const access = usePremiumAccess()
  const showPremium = usePremiumPrompt()
  const t = useTranslations('Premium')
  if (access.isLoading)
    return (
      <div role="status" className="rounded-lg bg-muted p-5 text-sm">
        {t('loading')}
      </div>
    )
  if (access.canUse(feature)) return children
  return (
    <div
      className="space-y-4 rounded-lg border bg-card p-5"
      data-testid={testId}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {t(`features.${feature}`)}
        <PremiumMark />
      </h2>
      <p
        role={access.state === 'error' ? 'alert' : undefined}
        className="text-sm leading-relaxed text-muted-foreground"
      >
        {t(`states.${access.state}`)}
      </p>
      {access.state === 'error' ? (
        <Button variant="outline" size="pill" onClick={() => access.refresh()}>
          {t('retry')}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => showPremium({ feature, state: access.state })}
        >
          {t('viewPlan')}
        </Button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('coreUnaffected')}
      </p>
    </div>
  )
}

export function usePremiumAction() {
  const access = usePremiumAccess()
  const t = useTranslations('Premium')
  const showPremium = usePremiumPrompt()
  function requireAccess(feature: PremiumFeature) {
    if (access.canUse(feature)) return true
    showPremium({ feature, state: access.state })
    return false
  }
  async function verifyAccess(feature: PremiumFeature) {
    if (!requireAccess(feature)) return false
    try {
      if (await verifyLifetimePremium()) return true
      await access.refresh()
      showPremium({ feature, state: 'expired' })
    } catch (error) {
      toast.add({
        title: t(`features.${feature}`),
        description: error instanceof Error ? error.message : t('states.error'),
        type: 'error',
      })
    }
    return false
  }
  return {
    ...access,
    requireAccess,
    verifyAccess,
    accessRequiredMessage: t('states.free'),
  }
}
