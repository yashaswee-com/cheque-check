'use client'

import {
  PremiumLink,
  PremiumSwitch,
} from '@/features/monetization/components/premium-controls'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useMonetization } from '@/features/monetization/hooks/use-monetization'
import { useRazorpay } from '@/features/monetization/hooks/use-razorpay'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PhoneInput } from '@/components/ui/phone-input'
import { toast } from '@/components/ui/toast'
import { isValidE164Phone } from '@/lib/phone'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { FEATURE_IDS, PRODUCT_IDS } from '@/features/monetization/constants'
import { getPaymentProductIcon } from '@/features/monetization/lib/payment-product-icons'
import type { Profile } from '@/types'
import { usePremiumAccess } from '@/features/monetization/hooks/use-premium-access'
import { PREMIUM_FEATURES } from '@/features/monetization/lib/premium-access'
import { PremiumMark } from '@/features/monetization/components/premium-mark'

function FeatureStatus({
  children,
  active = false,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold',
        active && 'bg-primary/10 text-primary',
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  )
}

export default function FeaturesPage() {
  const t = useTranslations('Features')
  const referrals = useTranslations('Referrals')
  const tc = useTranslations('Common')
  const productNames = useTranslations('ProductNames')
  const tp = useTranslations('Premium')
  const premium = usePremiumAccess()
  const display = useDisplayFormat()
  const queryClient = useQueryClient()
  const { profile, updateProfile, isLoading: isLoadingProfile } = useProfile()
  const {
    isLifetimePremium,
    checkEntitlement,
    getQuota,
    entitlements,
    isLoading,
    error,
    getEntitlementState,
  } = useMonetization()
  const { processPayment, isProcessing } = useRazorpay()
  const processPaymentRef = useRef(processPayment)
  const [profilePhone, setProfilePhone] = useState<string>()
  const [saving, setSaving] = useState<string | null>(null)
  const [isSendingTestCall, setIsSendingTestCall] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [phoneError, setPhoneError] = useState(false)
  const purchaseProcessed = useRef<string | null>(null)
  const refreshInProgress = useRef(false)
  const phone = profilePhone ?? profile?.phone ?? ''
  const phoneChanged = phone !== (profile?.phone ?? '')
  const validPhone = isValidE164Phone(phone)
  const voiceQuota = getQuota(FEATURE_IDS.VOICE_REMINDER)
  const remainingCalls = Math.max(
    0,
    (voiceQuota?.limit ?? 0) - (voiceQuota?.used ?? 0),
  )

  const notifyError = useCallback(
    (error: unknown) => {
      toast.add({
        title: tc('error'),
        description: error instanceof Error ? error.message : t('updateFailed'),
        type: 'error',
      })
    },
    [t, tc],
  )

  async function saveProfile(key: string, changes: Partial<Profile>) {
    if (saving !== null) return
    setSaving(key)
    try {
      await updateProfile(changes)
      toast.add({
        title: tc('success'),
        description: t('settingsSaved'),
        type: 'success',
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setSaving(null)
    }
  }

  const refreshAccess = useCallback(async () => {
    if (refreshInProgress.current) return
    refreshInProgress.current = true
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries(
          { queryKey: queryKeys.monetization.entitlements() },
          { throwOnError: true },
        ),
        queryClient.invalidateQueries(
          { queryKey: queryKeys.monetization.quotas() },
          { throwOnError: true },
        ),
      ])
    } catch (error) {
      notifyError(error)
    } finally {
      refreshInProgress.current = false
      setIsRefreshing(false)
    }
  }, [notifyError, queryClient])

  useEffect(() => {
    processPaymentRef.current = processPayment
  }, [processPayment])

  useEffect(() => {
    if (isLoading || isLoadingProfile) return
    const url = new URL(window.location.href || 'http://localhost/')
    const productId = url.searchParams.get('purchase')
    if (!productId || purchaseProcessed.current === productId) return
    if (
      !Object.values(PRODUCT_IDS).includes(
        productId as (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS],
      )
    ) {
      url.searchParams.delete('purchase')
      window.history.replaceState(null, '', `${url.pathname}${url.search}`)
      return
    }

    purchaseProcessed.current = productId
    url.searchParams.delete('purchase')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    void processPaymentRef.current({
      productId: productId as (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS],
      onSuccess: refreshAccess,
    })
  }, [isLoading, isLoadingProfile, refreshAccess])

  async function sendTestCall() {
    if (isSendingTestCall) return
    setIsSendingTestCall(true)
    try {
      const response = await fetch('/api/notifications/test-voice', {
        method: 'POST',
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('testCallFailed'))
      toast.add({
        title: tc('success'),
        description: body.queued ? t('testCallQueued') : t('testCallSent'),
        type: 'success',
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.monetization.quotas(),
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setIsSendingTestCall(false)
    }
  }

  const addons = [
    {
      id: 'ai',
      name: productNames(PRODUCT_IDS.AI_SCANNER_30D),
      description: t('aiScannerDesc'),
      productId: PRODUCT_IDS.AI_SCANNER_30D,
      topUpProductId: PRODUCT_IDS.AI_SCAN_250,
      subscriptionId: FEATURE_IDS.AI_SCANNER_SUB,
      quotaId: FEATURE_IDS.AI_SCAN,
      count: 250,
      unit: t('scans'),
    },
    {
      id: 'voice',
      name: productNames(PRODUCT_IDS.VOICE_REMINDER_30D),
      description: t('voiceReminderDesc'),
      productId: PRODUCT_IDS.VOICE_REMINDER_30D,
      topUpProductId: PRODUCT_IDS.VOICE_REMINDER_100,
      subscriptionId: FEATURE_IDS.VOICE_REMINDER_SUB,
      quotaId: FEATURE_IDS.VOICE_REMINDER,
      count: 100,
      unit: t('calls'),
    },
  ] as const

  return (
    <div
      className="@container mx-auto w-full min-w-0 max-w-5xl space-y-10 pb-24 pt-2"
      data-testid="features-page"
    >
      <header className="max-w-2xl space-y-3">
        <p className="text-sm font-semibold text-primary">{t('pageEyebrow')}</p>
        <h1 className="font-heading text-[28px] font-semibold leading-[1.1] tracking-tight @min-[420px]:text-[34px] @min-[640px]:text-[40px]">
          {t('pageTitle')}
        </h1>
        <p className="text-[17px] leading-relaxed text-muted-foreground">
          {t('pageDescription')}
        </p>
        <Button
          variant="outline"
          size="pill"
          loading={isRefreshing}
          onClick={refreshAccess}
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
          {t('refreshStatus')}
        </Button>
      </header>

      {isLoading || isLoadingProfile ? (
        <div role="status" className="rounded-lg bg-canvas-parchment p-6">
          {t('loading')}
        </div>
      ) : error || !profile ? (
        <div role="alert" className="space-y-4 rounded-lg border p-6">
          <p>{t('loadFailed')}</p>
          <Button
            variant="outline"
            size="pill"
            onClick={() => window.location.reload()}
          >
            {t('tryAgain')}
          </Button>
        </div>
      ) : (
        <>
          <section
            aria-labelledby="lifetime-title"
            className="overflow-hidden rounded-lg border bg-card"
          >
            <div className="grid gap-6 bg-canvas-parchment p-5 @min-[640px]:grid-cols-[1fr_auto] @min-[640px]:items-center @min-[640px]:p-8">
              <div className="space-y-3">
                <FeatureStatus active={!!isLifetimePremium}>
                  {premium.state === 'free'
                    ? t('oneTimeLabel')
                    : tp(`labels.${premium.state}`)}
                </FeatureStatus>
                <h2
                  id="lifetime-title"
                  className="text-2xl font-semibold tracking-tight @min-[640px]:text-3xl"
                >
                  {productNames(PRODUCT_IDS.LIFETIME_PREMIUM)}
                  <PremiumMark className="ml-2 align-middle" />
                </h2>
                <Link className="text-sm underline" href="/referrals">
                  {referrals('title')}
                </Link>
                <p className="max-w-lg text-[17px] leading-relaxed text-muted-foreground">
                  {t('lifetimeAccess')}
                </p>
              </div>
              <div className="space-y-3 @min-[640px]:max-w-64">
                {premium.hasLifetimePurchase ? (
                  <p className="text-sm font-semibold">
                    {t('alreadyUnlocked')}
                  </p>
                ) : premium.state === 'paused' || premium.state === 'active' ? (
                  <Link
                    href="/settings/help-and-support"
                    className="inline-flex min-h-11 items-center text-sm text-primary"
                  >
                    {tp('contactSupport')}
                  </Link>
                ) : (
                  <>
                    <p className="text-2xl font-semibold tracking-tight">
                      {t('receivingPrice')}
                    </p>
                    <Button
                      loading={isProcessing}
                      size="pill"
                      className="h-auto min-h-11 w-full whitespace-normal py-3 font-normal"
                      disabled={
                        isProcessing ||
                        premium.isLoading ||
                        premium.state === 'error'
                      }
                      onClick={() =>
                        processPayment({
                          productId: PRODUCT_IDS.LIFETIME_PREMIUM,
                          onSuccess: refreshAccess,
                        })
                      }
                    >
                      {t('getLifetimePremium')}
                    </Button>
                  </>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('oneTimePurchase')}
                </p>
              </div>
            </div>
            {premium.state !== 'free' && (
              <div className="space-y-2 border-t px-5 py-4 text-sm leading-relaxed @min-[640px]:px-8">
                <p role={premium.state === 'error' ? 'alert' : undefined}>
                  {tp(`states.${premium.state}`)}
                </p>
                {premium.validUntil && premium.hasAccess && (
                  <p className="text-muted-foreground">
                    {tp(
                      premium.state === 'trialing'
                        ? 'trialUntil'
                        : 'accessUntil',
                      {
                        date: display.date(premium.validUntil),
                      },
                    )}
                  </p>
                )}
              </div>
            )}
            <div className="divide-y px-5 @min-[640px]:px-8">
              <div className="flex items-start justify-between gap-4 py-6">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-[17px] font-semibold">
                    {t('receivingMode')}
                  </h3>
                  <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {t('receivingModeDesc')}
                  </p>
                  <p className="pt-2 text-xs font-semibold">
                    {isLifetimePremium
                      ? profile.received_cheques_enabled
                        ? t('inwardEnabled')
                        : t('inwardDisabled')
                      : t('includedPremium')}
                  </p>
                </div>
                {isLifetimePremium && (
                  <div className="flex min-h-11 shrink-0 items-center">
                    <PremiumSwitch
                      feature="inward-tracking"
                      checked={!!profile.received_cheques_enabled}
                      disabled={saving !== null}
                      onCheckedChange={(value) =>
                        saveProfile('inward', {
                          received_cheques_enabled: value,
                        })
                      }
                      aria-label={t('receivingMode')}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start justify-between gap-3 py-6 @min-[640px]:flex-row @min-[640px]:items-center">
                <div className="space-y-1">
                  <h3 className="text-[17px] font-semibold">
                    {t('reportsTitle')}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t('reportsDescription')}
                  </p>
                </div>
                {isLifetimePremium ? (
                  <PremiumLink
                    feature="reports"
                    href="/reports"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {t('openReports')}{' '}
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                  </PremiumLink>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('includedPremium')}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-4 border-t p-5 @min-[640px]:p-8">
              <h3 className="text-lg font-semibold">{tp('benefitsTitle')}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tp('benefitsDescription')}
              </p>
              <ul className="grid gap-3 text-sm @min-[640px]:grid-cols-2">
                {PREMIUM_FEATURES.filter(
                  (feature) =>
                    feature !== 'inward-tracking' && feature !== 'reports',
                ).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span aria-hidden className="text-primary">
                      +
                    </span>
                    {tp(`features.${feature}`)}
                  </li>
                ))}
              </ul>
              <PremiumLink
                feature="bulk-import"
                href="/premium"
                className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
              >
                {tp('openTools')}{' '}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </PremiumLink>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {tp('coreUnaffected')}
              </p>
            </div>
          </section>

          <section aria-labelledby="addons-title" className="space-y-5">
            <div className="space-y-2">
              <h2
                id="addons-title"
                className="text-2xl font-semibold tracking-tight"
              >
                {t('addOnServices')}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t('addOnServicesDescription')}
              </p>
            </div>
            <div className="grid items-start gap-5 @min-[640px]:grid-cols-2">
              {addons.map((addon) => {
                const subscribed = !!checkEntitlement(addon.subscriptionId)
                const quota = getQuota(addon.quotaId)
                const hasAccess = subscribed || (quota?.limit ?? 0) > 0
                const remaining = Math.max(
                  0,
                  (quota?.limit ?? 0) - (quota?.used ?? 0),
                )
                const isVoice = addon.id === 'voice'
                const paused = isVoice && !profile.voice_call_enabled
                const needsPhone =
                  isVoice && !isValidE164Phone(profile.phone ?? '')
                const entitlementState = getEntitlementState(
                  addon.subscriptionId,
                )
                const accessBlocked =
                  entitlementState === 'paused' ||
                  entitlementState === 'canceled'
                const showEntitlementState =
                  accessBlocked ||
                  entitlementState === 'expired' ||
                  entitlementState === 'trialing'
                const status = !hasAccess
                  ? 'notEnabled'
                  : remaining === 0
                    ? 'outOfCredits'
                    : paused
                      ? 'paused'
                      : needsPhone
                        ? 'setupRequired'
                        : 'ready'
                const entitlement = entitlements?.find(
                  (e) => e.feature_id === addon.subscriptionId,
                )
                return (
                  <article
                    key={addon.id}
                    aria-labelledby={`${addon.id}-title`}
                    className="min-w-0 rounded-lg border bg-card"
                  >
                    <div className="space-y-5 p-5 @min-[640px]:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex size-11 items-center justify-center rounded-md bg-canvas-parchment text-primary">
                          <HugeiconsIcon
                            icon={getPaymentProductIcon(addon.productId)}
                            className="size-6"
                          />
                        </div>
                        <FeatureStatus active={status === 'ready'}>
                          {showEntitlementState
                            ? tp(`labels.${entitlementState}`)
                            : t(status)}
                        </FeatureStatus>
                      </div>
                      <div className="space-y-2">
                        <h3
                          id={`${addon.id}-title`}
                          className="text-xl font-semibold tracking-tight"
                        >
                          {addon.name}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {addon.description}
                        </p>
                      </div>
                      {!subscribed && (
                        <div className="space-y-1">
                          <p className="text-[17px] font-semibold">
                            {t('monthlyPrice')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t('includedUsage', {
                              count: addon.count,
                              unit: addon.unit,
                            })}
                          </p>
                        </div>
                      )}

                      {hasAccess && (
                        <div className="space-y-3 rounded-md bg-canvas-parchment p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-semibold">
                              {t('remainingUsage', {
                                count: remaining,
                                unit: addon.unit,
                              })}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {subscribed
                                ? t('activeSubscription')
                                : t('trialAccess')}
                            </span>
                          </div>
                          <Progress
                            value={
                              quota?.limit
                                ? Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      (quota.used / quota.limit) * 100,
                                    ),
                                  )
                                : 0
                            }
                            role="progressbar"
                            aria-label={`${addon.name}: ${t('currentUsage')}`}
                            aria-valuemin={0}
                            aria-valuemax={quota?.limit || 1}
                            aria-valuenow={Math.min(
                              quota?.used ?? 0,
                              quota?.limit || 1,
                            )}
                          />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {t('usedUsage', {
                              used: quota?.used ?? 0,
                              limit: quota?.limit ?? 0,
                              unit: addon.unit,
                            })}
                          </p>
                          {subscribed && entitlement?.valid_until && (
                            <p className="text-xs text-muted-foreground">
                              {t('accessUntil', {
                                date: display.date(entitlement.valid_until),
                              })}
                            </p>
                          )}
                          {quota?.reset_at &&
                            quota.reset_at !== entitlement?.valid_until && (
                              <p className="text-xs text-muted-foreground">
                                {t('quotaReset', {
                                  date: display.date(quota.reset_at),
                                })}
                              </p>
                            )}
                          {remaining === 0 && (
                            <p className="text-sm leading-relaxed">
                              {subscribed
                                ? t('topUpToContinue')
                                : t('subscribeToContinue')}
                            </p>
                          )}
                        </div>
                      )}

                      {subscribed ? (
                        <Button
                          loading={isProcessing}
                          size="pill"
                          variant="outline"
                          className="h-auto min-h-11 w-full whitespace-normal py-3 font-normal"
                          disabled={isProcessing}
                          onClick={() =>
                            processPayment({
                              productId: addon.topUpProductId,
                              onSuccess: refreshAccess,
                            })
                          }
                        >
                          {productNames(addon.topUpProductId)} ·{' '}
                          {display.currency(50, '₹')}
                        </Button>
                      ) : (
                        <Button
                          loading={isProcessing}
                          size="pill"
                          className="h-auto min-h-11 w-full whitespace-normal py-3 font-normal"
                          disabled={isProcessing}
                          onClick={() =>
                            processPayment({
                              productId: addon.productId,
                              onSuccess: refreshAccess,
                            })
                          }
                        >
                          {hasAccess
                            ? t('upgradeSubscription')
                            : t('enableAddon')}
                        </Button>
                      )}
                      {!subscribed && hasAccess && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t('topUpRequiresSubscription')}
                        </p>
                      )}
                      {hasAccess && !isVoice && remaining > 0 && (
                        <Link
                          href="/cheques/create"
                          className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {t('scanCheque')}{' '}
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            className="size-4"
                          />
                        </Link>
                      )}
                    </div>

                    {isVoice && hasAccess && (
                      <div className="space-y-5 border-t p-5 @min-[640px]:p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <label
                              htmlFor="voice-enabled"
                              className="text-sm font-semibold"
                            >
                              {t('enableService')}
                            </label>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {profile.voice_call_enabled
                                ? t('voiceEnabledHelp')
                                : t('voicePausedHelp')}
                            </p>
                          </div>
                          <div className="flex min-h-11 shrink-0 items-center">
                            <Switch
                              id="voice-enabled"
                              aria-label={t('enableService')}
                              checked={!!profile.voice_call_enabled}
                              disabled={saving !== null || isSendingTestCall}
                              onCheckedChange={(value) =>
                                saveProfile('voice', {
                                  voice_call_enabled: value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <form
                          className="space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault()
                            if (!validPhone) {
                              setPhoneError(true)
                              return
                            }
                            setPhoneError(false)
                            void saveProfile('phone', { phone })
                          }}
                        >
                          <label
                            htmlFor="voice-phone"
                            className="text-sm font-semibold"
                          >
                            {t('yourPhoneNumber')}
                          </label>
                          <PhoneInput
                            id="voice-phone"
                            value={phone}
                            onChange={(value) => {
                              setProfilePhone(value)
                              setPhoneError(false)
                            }}
                            disabled={saving !== null || isSendingTestCall}
                            aria-invalid={
                              phoneError || (!!phone && !validPhone)
                            }
                            className="h-12 rounded-md"
                          />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {t('countryCodeHelp')}
                          </p>
                          {(phoneError || (!!phone && !validPhone)) && (
                            <p
                              role="alert"
                              className="text-sm text-destructive"
                            >
                              {tc('invalidPhone')}
                            </p>
                          )}
                          {(phoneChanged || needsPhone) && (
                            <Button
                              type="submit"
                              loading={saving === 'phone'}
                              variant="outline"
                              size="pill"
                              className="w-full font-normal"
                              disabled={
                                saving !== null ||
                                !phoneChanged ||
                                isSendingTestCall
                              }
                            >
                              {t('savePhone')}
                            </Button>
                          )}
                        </form>
                        <div className="space-y-2">
                          <Button
                            loading={isSendingTestCall}
                            variant="outline"
                            size="pill"
                            className="w-full font-normal"
                            disabled={
                              isSendingTestCall ||
                              saving !== null ||
                              !profile.voice_call_enabled ||
                              !validPhone ||
                              phoneChanged ||
                              remainingCalls === 0
                            }
                            onClick={sendTestCall}
                          >
                            {t('sendTestCall')}
                          </Button>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {phoneChanged
                              ? t('saveBeforeTest')
                              : !validPhone
                                ? t('saveValidPhone')
                                : !profile.voice_call_enabled
                                  ? t('enableBeforeTest')
                                  : t('testCallHelp')}
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
