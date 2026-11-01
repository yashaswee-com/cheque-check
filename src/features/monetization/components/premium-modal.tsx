'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import type { PremiumFeature, PremiumState } from '../lib/premium-access'
import { usePremiumAccess } from '../hooks/use-premium-access'

interface PremiumModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  featureName?: string
  description?: string
  onCloseRedirect?: string // Where to go if they close without buying (e.g. back to home)
  feature?: PremiumFeature
  accessState?: PremiumState
}

export function PremiumModal({
  open,
  onOpenChange,
  featureName,
  description,
  onCloseRedirect,
  feature,
  accessState = 'free',
}: PremiumModalProps) {
  const router = useRouter()
  const t = useTranslations('Common')
  const tp = useTranslations('Premium')

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen && onCloseRedirect) {
      router.push(onCloseRedirect)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="max-h-[90dvh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <HugeiconsIcon icon={StarIcon} className="h-6 w-6 text-primary" />
          </div>
          <SheetTitle className="text-center text-xl font-bold">
            {feature ? tp(`features.${feature}`) : t('premiumFeature')}
          </SheetTitle>
          <SheetDescription className="text-center text-base">
            <span className="font-semibold text-foreground block mb-2">
              {feature
                ? tp('title')
                : t('featureLocked', {
                    featureName: featureName ?? tp('title'),
                  })}
            </span>
            {feature
              ? tp(`descriptions.${feature}`)
              : (description ?? tp('states.free'))}
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          {feature ? (
            <PremiumAccessActions
              key={`${feature}:${accessState}`}
              state={accessState}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={() => {
                onOpenChange(false)
                router.push('/features/catalog')
              }}
            >
              {t('viewPremiumPlans')}
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full h-12 text-base"
            onClick={() => handleOpenChange(false)}
          >
            {t('maybeLater')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PremiumAccessActions({
  state: initialState,
  onClose,
}: {
  state: PremiumState
  onClose: () => void
}) {
  const access = usePremiumAccess()
  const t = useTranslations('Premium')
  const tc = useTranslations('Common')
  const router = useRouter()
  const [retried, setRetried] = useState(false)
  const [checking, setChecking] = useState(false)
  const state = checking
    ? 'loading'
    : retried || initialState === 'loading'
      ? access.state
      : initialState
  return (
    <>
      <p
        role={state === 'error' ? 'alert' : 'status'}
        className="text-center text-sm text-muted-foreground"
      >
        {t(`states.${state}`)}
      </p>
      {state === 'loading' || state === 'error' ? (
        <Button
          variant="outline"
          loading={state === 'loading'}
          onClick={async () => {
            setChecking(true)
            try {
              await access.refresh()
              setRetried(true)
            } finally {
              setChecking(false)
            }
          }}
        >
          {state === 'loading' ? t('loading') : t('retry')}
        </Button>
      ) : state === 'active' || state === 'trialing' ? (
        <Button onClick={onClose}>{tc('continue')}</Button>
      ) : (
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={() => {
            onClose()
            router.push(
              state === 'paused'
                ? '/settings/help-and-support'
                : '/features/catalog',
            )
          }}
        >
          {state === 'paused' ? t('contactSupport') : t('viewPlan')}
        </Button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('coreUnaffected')}
      </p>
    </>
  )
}
