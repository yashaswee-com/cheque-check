'use client'

import { useState } from 'react'
import {
  Calendar03Icon as Calendar,
  CallIcon as Phone,
  Clock01Icon as Clock,
  TextFontIcon as TextIcon,
  Wallet01Icon as Wallet,
  Building03Icon as Building2,
  Settings02Icon as Settings2,
  Notification01Icon as Bell,
  ArrowRight01Icon as ArrowRight,
  ArrowLeft01Icon as ArrowLeft,
  Location01Icon as MapPin,
  Tick02Icon as Check,
} from '@hugeicons/core-free-icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { businessService } from '@/features/businesses/services/business.service'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { ClipboardGuard } from '@/features/security/components/clipboard-guard'
import { useTimeFormatOptions } from '@/features/profile/hooks/use-time-format-options'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Combobox } from '@/components/ui/combobox'
import { queryKeys } from '@/lib/query-keys'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper'
import { useTranslations } from 'next-intl'
import type { IconSvgElement } from '@hugeicons/react'
import { FieldError } from '@/components/ui/field-error'
import { LocationInput } from '@/components/ui/location-input'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { InfoPopover } from '@/components/ui/info-popover'
import { PhoneInput } from '@/components/ui/phone-input'
import { businessSchema } from '@/validators'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  ONBOARDING_LANGUAGE_OPTIONS as LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/features/profile/lib/preference-options'
import { useReminderOptions } from '@/features/profile/hooks/use-reminder-options'
import { syncMarketing } from '@/features/analytics/browser'

export default function OnboardingPage() {
  const t = useTranslations('Onboarding')
  const tc = useTranslations('Common')

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsAttempted, setTermsAttempted] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile, updateProfile } = useProfile()
  const timeFormatOptions = useTimeFormatOptions()
  const { setActiveBusiness } = useBusiness()

  const { REMINDERS_PER_DAY_OPTIONS, REMINDER_FREQUENCY_OPTIONS } =
    useReminderOptions()

  // Form State
  const [formData, setFormData] = useState({
    businessName: '',
    businessPhone: '',
    businessAddress: '',
    businessColor: '#6b7280',
    currency: '₹',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '12h',
    timeZone: 'Asia/Kolkata',
    language: 'hi-en',
    remindersPerDay: '1',
    defaultReminderDays: '3',
  })

  // Synchronize form data with profile when it loads
  const [prevProfileId, setPrevProfileId] = useState<string | undefined>(
    profile?.id,
  )
  if (profile && profile.id !== prevProfileId) {
    setPrevProfileId(profile.id)
    setFormData((prev) => ({
      ...prev,
      currency: profile.currency || '₹',
      dateFormat: profile.date_format || 'dd/MM/yyyy',
      timeFormat: profile.time_format || '12h',
      timeZone: profile.time_zone || 'Asia/Kolkata',
      language: profile.language || 'hi-en',
      remindersPerDay: profile.reminders_per_day.toString(),
      defaultReminderDays: profile.default_reminder_days.toString(),
    }))
  }

  const nextStep = () => {
    if (step === 4) setTermsAttempted(true)
    setStep((current) => Math.min(current + 1, 6))
  }
  const prevStep = () => setStep((s) => Math.max(s - 1, 1))
  const isBusinessPhoneValid = businessSchema.shape.phone.safeParse(
    formData.businessPhone,
  ).success
  const arePreferencesComplete = [
    formData.currency,
    formData.language,
    formData.dateFormat,
    formData.timeFormat,
    formData.timeZone,
  ].every(Boolean)
  const canAdvance =
    (step === 1 && Boolean(formData.businessName.trim())) ||
    (step === 2 && arePreferencesComplete) ||
    (step === 3 && isBusinessPhoneValid) ||
    step === 4 ||
    (step === 5 && termsAccepted)
  const preferenceFields: Array<{
    id: string
    key: 'currency' | 'language' | 'dateFormat' | 'timeFormat' | 'timeZone'
    label: string
    icon: IconSvgElement
    options: Array<{ value: string; label: string }>
  }> = [
    {
      id: 'currency',
      key: 'currency',
      label: t('currency'),
      icon: Wallet,
      options: CURRENCY_OPTIONS,
    },
    {
      id: 'language',
      key: 'language',
      label: t('language'),
      icon: TextIcon,
      options: LANGUAGE_OPTIONS,
    },
    {
      id: 'date-format',
      key: 'dateFormat',
      label: t('dateFormat'),
      icon: Calendar,
      options: DATE_FORMAT_OPTIONS,
    },
    {
      id: 'time-format',
      key: 'timeFormat',
      label: t('timeFormat'),
      icon: Clock,
      options: timeFormatOptions,
    },
    {
      id: 'time-zone',
      key: 'timeZone',
      label: t('timeZone'),
      icon: MapPin,
      options: TIMEZONE_OPTIONS,
    },
  ]

  const handleFinish = async () => {
    if (!termsAccepted) {
      setTermsAttempted(true)
      return
    }
    setIsSubmitting(true)
    try {
      // 1. Create Business
      const business = await businessService.create({
        name: formData.businessName,
        email: null,
        phone: formData.businessPhone || null,
        address: formData.businessAddress || null,
        color: formData.businessColor,
        logo_url: null,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.businesses.all(),
      })
      setActiveBusiness(business)

      // 2. Update Profile
      await updateProfile({
        currency: formData.currency,
        date_format: formData.dateFormat,
        time_format: formData.timeFormat,
        time_zone: formData.timeZone,
        language: formData.language,
        reminders_per_day: parseInt(formData.remindersPerDay),
        default_reminder_days: parseInt(formData.defaultReminderDays),
      })

      void syncMarketing('onboarding_completed')
      setStep(6)
    } catch (error) {
      alert(error instanceof Error ? error.message : tc('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const containerVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  }

  return (
    <div className="min-h-full bg-background dark:bg-black selection:bg-muted transition-colors duration-500">
      <ClipboardGuard />
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-8 md:py-16">
        {/* Header */}
        <div className="flex items-center justify-center min-h-[64px]">
          <div className="text-center" data-testid="onboarding-heading">
            {step < 6 ? (
              <h1 className="text-display-md md:text-display-lg font-semibold tracking-tight text-ink dark:text-white flex items-center justify-center gap-3">
                {step === 1 && (
                  <HugeiconsIcon
                    icon={Wallet}
                    className="h-8 w-8 text-muted-foreground"
                  />
                )}
                {step === 2 && (
                  <HugeiconsIcon
                    icon={Settings2}
                    className="h-8 w-8 text-muted-foreground"
                  />
                )}
                {step === 3 && (
                  <HugeiconsIcon
                    icon={Building2}
                    className="h-8 w-8 text-muted-foreground"
                  />
                )}
                {step === 4 && (
                  <HugeiconsIcon
                    icon={Bell}
                    className="h-8 w-8 text-muted-foreground"
                  />
                )}
                {step === 5 && (
                  <HugeiconsIcon
                    icon={Check}
                    className="h-8 w-8 text-muted-foreground"
                  />
                )}
                <span>
                  {step === 1 && t('welcome')}
                  {step === 2 && t('personalizeExperience')}
                  {step === 3 && t('businessDetails')}
                  {step === 4 && t('notifications')}
                  {step === 5 && t('acceptTerms')}
                </span>
              </h1>
            ) : null}
          </div>
        </div>

        {/* Progress Bar */}
        {step < 6 && (
          <Stepper
            value={Math.min(step, 5)}
            className="w-full max-w-xl mx-auto space-y-8"
            indicators={{
              completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
            }}
          >
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevStep}
                disabled={step === 1}
                data-testid="onboarding-back-button"
                className="rounded-full h-8 w-8 shrink-0 hover:bg-canvas-parchment"
              >
                <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
              </Button>

              <StepperNav className="gap-3 flex-1">
                {[
                  {
                    title: tc('welcome'),
                    icon: <HugeiconsIcon icon={Wallet} className="size-4" />,
                  },
                  {
                    title: t('personalizeExperience'),
                    icon: <HugeiconsIcon icon={Settings2} className="size-4" />,
                  },
                  {
                    title: t('businessDetails'),
                    icon: <HugeiconsIcon icon={Building2} className="size-4" />,
                  },
                  {
                    title: t('notifications'),
                    icon: <HugeiconsIcon icon={Bell} className="size-4" />,
                  },
                  {
                    title: t('acceptTerms'),
                    icon: <HugeiconsIcon icon={Check} className="size-4" />,
                  },
                ].map((s, index) => (
                  <StepperItem
                    key={index}
                    step={index + 1}
                    className="relative flex-1 items-center"
                  >
                    <StepperTrigger className="flex grow flex-col items-center justify-center gap-2.5">
                      <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-background z-10">
                        {s.icon}
                      </StepperIndicator>
                    </StepperTrigger>
                    {5 > index + 1 && (
                      <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                    )}
                  </StepperItem>
                ))}
              </StepperNav>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (step === 5) {
                    if (!termsAccepted) {
                      setTermsAttempted(true)
                      return
                    }
                    void handleFinish()
                  } else {
                    nextStep()
                  }
                }}
                disabled={!canAdvance || (step === 5 && isSubmitting)}
                data-testid="onboarding-next-button"
                className="rounded-full h-8 w-8 shrink-0 hover:bg-canvas-parchment"
              >
                <HugeiconsIcon icon={ArrowRight} className="h-4 w-4" />
              </Button>
            </div>
          </Stepper>
        )}

        <div className="relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="onboarding-business-name"
                      required
                      className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground ml-1"
                    >
                      {t('businessName')}
                    </Label>
                    <div className="relative group">
                      <Input
                        id="onboarding-business-name"
                        leftIcon={Building2}
                        data-testid="onboarding-business-name-input"
                        placeholder={t('businessNamePlaceholder')}
                        value={formData.businessName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            businessName: e.target.value,
                          })
                        }
                        className="h-12 bg-background text-base rounded-sm transition-all focus:ring-2 focus:ring-muted-foreground/20"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full rounded-pill h-12 bg-foreground text-background font-medium hover:bg-foreground/90 active:scale-95 transition-transform"
                  data-testid="onboarding-step1-continue"
                  onClick={nextStep}
                  disabled={!formData.businessName.trim()}
                >
                  {t('getStarted')}{' '}
                  <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                <div
                  className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
                  data-testid="onboarding-preferences"
                >
                  {preferenceFields.map((field) => (
                    <div key={field.id} className="min-w-0 space-y-2">
                      <Label
                        htmlFor={`onboarding-${field.id}`}
                        required
                        className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground ml-1"
                      >
                        <HugeiconsIcon
                          icon={field.icon}
                          className="mr-1 inline size-4 align-text-bottom"
                          aria-hidden="true"
                        />
                        {field.label}
                      </Label>
                      <Combobox
                        id={`onboarding-${field.id}`}
                        testId={`onboarding-${field.id}`}
                        options={field.options}
                        value={formData[field.key]}
                        onValueChange={(v) =>
                          setFormData((prev) => ({ ...prev, [field.key]: v }))
                        }
                        className="h-12 bg-background border border-border rounded-sm text-base font-normal"
                      />
                      {!formData[field.key] && (
                        <FieldError>{t('fieldRequired')}</FieldError>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full rounded-pill h-12 bg-foreground text-background text-base font-medium hover:bg-foreground/90 active:scale-95 transition-transform"
                  data-testid="onboarding-step2-continue"
                  onClick={nextStep}
                  disabled={!arePreferencesComplete}
                >
                  {t('looksGood')}{' '}
                  <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="onboarding-business-phone"
                      className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground ml-1"
                    >
                      <HugeiconsIcon
                        icon={Phone}
                        className="mr-1 inline size-4 align-text-bottom"
                        aria-hidden="true"
                      />
                      {t('businessPhone')}
                    </Label>
                    <PhoneInput
                      id="onboarding-business-phone"
                      placeholder={t('businessPhonePlaceholder')}
                      value={formData.businessPhone}
                      onChange={(businessPhone) =>
                        setFormData((prev) => ({ ...prev, businessPhone }))
                      }
                      aria-invalid={!isBusinessPhoneValid}
                      className="h-12 dark:bg-surface-tile-1 text-base"
                    />
                    {formData.businessPhone && !isBusinessPhoneValid && (
                      <FieldError id="onboarding-business-phone-error">
                        {tc('invalidPhone')}
                      </FieldError>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="onboarding-headquarters"
                      className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground ml-1"
                    >
                      <HugeiconsIcon
                        icon={MapPin}
                        className="mr-1 inline size-4 align-text-bottom"
                        aria-hidden="true"
                      />
                      {t('headquarters')}
                    </Label>
                    <LocationInput
                      id="onboarding-headquarters"
                      data-testid="onboarding-headquarters-input"
                      placeholder={t('headquartersPlaceholder')}
                      value={formData.businessAddress}
                      onChange={(businessAddress) =>
                        setFormData((previous) => ({
                          ...previous,
                          businessAddress,
                        }))
                      }
                      className="h-12 bg-background border border-border text-base rounded-sm"
                    />
                  </div>
                </div>

                <Button
                  className="w-full rounded-pill h-12 bg-foreground text-background text-base font-medium hover:bg-foreground/90 active:scale-95 transition-transform"
                  data-testid="onboarding-step3-continue"
                  onClick={nextStep}
                  disabled={!isBusinessPhoneValid}
                >
                  {tc('continue')}{' '}
                  <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-4"
              >
                <div className="space-y-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground ml-1">
                        {t('advancedWarning')}
                      </Label>
                      <InfoPopover title={t('advancedWarning')}>
                        {t('advancedWarningHelp')}
                      </InfoPopover>
                    </div>
                    <Combobox
                      options={REMINDER_FREQUENCY_OPTIONS}
                      value={formData.defaultReminderDays}
                      allowDeselect={false}
                      testId="onboarding-advanced-warning"
                      onValueChange={(v) =>
                        setFormData({ ...formData, defaultReminderDays: v })
                      }
                      className="h-12 bg-background border border-border rounded-sm text-base font-normal"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground ml-1">
                        {t('dailyFrequency')}
                      </Label>
                      <InfoPopover title={t('dailyFrequency')}>
                        {t('dailyFrequencyHelp')}
                      </InfoPopover>
                    </div>
                    <Combobox
                      options={REMINDERS_PER_DAY_OPTIONS}
                      value={formData.remindersPerDay}
                      allowDeselect={false}
                      testId="onboarding-daily-frequency"
                      onValueChange={(v) =>
                        setFormData({ ...formData, remindersPerDay: v })
                      }
                      className="h-12 bg-background border border-border rounded-sm text-base font-normal"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-4">
                  <div className="flex items-center gap-4">
                    <EntityAvatar name={formData.businessName} size="lg" />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink dark:text-white">
                        {formData.businessName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t('readyToManage')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full rounded-pill h-12 bg-foreground text-background text-base font-medium hover:bg-foreground/90 active:scale-95 transition-transform"
                  data-testid="onboarding-step4-continue"
                  onClick={nextStep}
                >
                  {tc('continue')}{' '}
                  <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                <div className="space-y-2">
                  <h2 className="text-xl font-medium">{t('acceptTerms')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('termsDescription')}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start gap-3">
                    <input
                      id="onboarding-accept-terms"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(event) => {
                        setTermsAccepted(event.target.checked)
                        setTermsAttempted(false)
                      }}
                      className="mt-1 size-4 shrink-0 accent-foreground"
                      data-testid="onboarding-accept-terms-checkbox"
                    />
                    <Label
                      htmlFor="onboarding-accept-terms"
                      required
                      className="text-sm font-normal leading-6"
                    >
                      {t('termsAgreementPrefix')}{' '}
                      <Link
                        href="/settings/terms-and-conditions"
                        className="text-foreground underline underline-offset-2"
                      >
                        {t('termsAndConditions')}
                      </Link>{' '}
                      {t('and')}{' '}
                      <Link
                        href="/settings/privacy-policy"
                        className="text-foreground underline underline-offset-2"
                      >
                        {t('privacyPolicy')}
                      </Link>
                    </Label>
                  </div>
                  {termsAttempted && !termsAccepted && (
                    <FieldError className="mt-2">
                      {t('termsRequired')}
                    </FieldError>
                  )}
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <CreationSuccessScreen
                key="step6"
                description={t('successMessage')}
                ctaLabel={t('enterDashboard')}
                continueTestId="onboarding-enter-dashboard"
                onContinue={() => router.push('/dashboard')}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
