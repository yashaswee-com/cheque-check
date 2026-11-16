'use client'

import { FormLabel } from '@/components/ui/form-label'
import { File01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import {
  Calendar03Icon as Calendar,
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
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import {
  ShellBottomSlot,
  ShellBottomSlotProvider,
} from '@/components/shell-bottom-slot'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { InfoPopover } from '@/components/ui/info-popover'
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
    businessLogo: null as string | null,
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
    if (step === 3) setTermsAttempted(true)
    setStep((current) => Math.min(current + 1, 4))
  }
  const prevStep = () => setStep((s) => Math.max(s - 1, 1))
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
    step === 3 ||
    (step === 4 && termsAccepted)
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
        phone: null,
        address: null,
        color: formData.businessColor,
        logo_url: formData.businessLogo,
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
      setStep(5)
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
    <ShellBottomSlotProvider>
      <div className="flex h-full min-h-0 shrink-0 flex-col bg-background dark:bg-black selection:bg-muted transition-colors duration-500">
        <ClipboardGuard />
        <form
          id="onboarding-form"
          className="mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-8 px-6 py-8 md:py-16"
          onSubmit={(event) => {
            event.preventDefault()
            if (isSubmitting || !canAdvance) return
            if (step === 4) {
              void handleFinish()
            } else {
              nextStep()
            }
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-center min-h-[64px]">
            <div className="text-center" data-testid="onboarding-heading">
              {step < 5 ? (
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
                      icon={Bell}
                      className="h-8 w-8 text-muted-foreground"
                    />
                  )}
                  {step === 4 && (
                    <HugeiconsIcon
                      icon={Check}
                      className="h-8 w-8 text-muted-foreground"
                    />
                  )}
                  <span>
                    {step === 1 && t('welcome')}
                    {step === 2 && t('personalizeExperience')}
                    {step === 3 && t('notifications')}
                    {step === 4 && t('acceptTerms')}
                  </span>
                </h1>
              ) : null}
            </div>
          </div>

          {/* Progress Bar */}
          {step < 5 && (
            <Stepper
              value={step}
              className="w-full max-w-xl mx-auto space-y-8"
              indicators={{
                completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
              }}
            >
              <div className="flex items-start gap-4">
                <Button
                  variant="ghost"
                  type="button"
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
                      icon: (
                        <HugeiconsIcon icon={Settings2} className="size-4" />
                      ),
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
                      <StepperTrigger
                        type="button"
                        className="flex grow flex-col items-center justify-center gap-2.5"
                      >
                        <StepperIndicator className="data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground data-[state=completed]:bg-success size-8 border-2 data-[state=completed]:text-white data-[state=inactive]:bg-background z-10">
                          {s.icon}
                        </StepperIndicator>
                      </StepperTrigger>
                      {4 > index + 1 && (
                        <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                      )}
                    </StepperItem>
                  ))}
                </StepperNav>

                <Button
                  variant="ghost"
                  size="icon"
                  type="submit"
                  disabled={!canAdvance || isSubmitting}
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
                  <div
                    className="flex flex-col items-center gap-3 py-2"
                    data-testid="onboarding-business-logo"
                  >
                    <EditableAvatar
                      name={formData.businessName || t('businessName')}
                      color={formData.businessColor}
                      imageUrl={formData.businessLogo}
                      onUpload={async (businessLogo) =>
                        setFormData((previous) => ({
                          ...previous,
                          businessLogo,
                        }))
                      }
                      onDelete={async () =>
                        setFormData((previous) => ({
                          ...previous,
                          businessLogo: null,
                        }))
                      }
                      size="xl"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('businessLogoOptional')}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <FormLabel
                        icon={Building2}
                        htmlFor="onboarding-business-name"
                        is_required
                        className="text-[11px] font-medium text-muted-foreground ml-1"
                      >
                        {t('businessName')}
                      </FormLabel>
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
                        <FormLabel
                          icon={field.icon}
                          htmlFor={`onboarding-${field.id}`}
                          is_required
                          className="text-[11px] font-normal text-muted-foreground ml-1"
                        >
                          {field.label}
                        </FormLabel>
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
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  variants={containerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-4"
                >
                  <div className="space-y-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-1">
                        <FormLabel
                          icon={Calendar}
                          className="text-[11px] font-normal text-muted-foreground ml-1"
                        >
                          {t('advancedWarning')}
                        </FormLabel>
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
                        <FormLabel
                          icon={Clock}
                          className="text-[11px] font-normal text-muted-foreground ml-1"
                        >
                          {t('dailyFrequency')}
                        </FormLabel>
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
                      <EntityAvatar
                        name={formData.businessName}
                        imageUrl={formData.businessLogo}
                        size="lg"
                      />
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
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="step4"
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
                      <FormLabel
                        icon={File01Icon}
                        htmlFor="onboarding-accept-terms"
                        is_required
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
                      </FormLabel>
                    </div>
                    {termsAttempted && !termsAccepted && (
                      <FieldError className="mt-2">
                        {t('termsRequired')}
                      </FieldError>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 5 && (
                <CreationSuccessScreen
                  key="step5"
                  description={t('successMessage')}
                  ctaLabel={t('enterDashboard')}
                  continueTestId="onboarding-enter-dashboard"
                  onContinue={() => router.push('/dashboard')}
                />
              )}
            </AnimatePresence>
          </div>
        </form>
        <ShellBottomSlot />
        {step < 5 && (
          <EditSaveBar
            formId="onboarding-form"
            label={
              step === 1
                ? t('getStarted')
                : step === 2
                  ? t('looksGood')
                  : step === 4
                    ? t('finishSetup')
                    : tc('continue')
            }
            isDirty
            isSaving={isSubmitting}
            isContinue={step < 4}
            disabled={!canAdvance}
            testId={
              step === 4
                ? 'onboarding-step4-finish'
                : `onboarding-step${step}-continue`
            }
          />
        )}
      </div>
    </ShellBottomSlotProvider>
  )
}
