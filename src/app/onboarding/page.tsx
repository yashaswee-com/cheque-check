'use client'

import { useState } from 'react'
import {
  UserIcon as User,
  Mail01Icon as Mail,
  LockPasswordIcon as Lock,
  CallIcon as Phone,
  Calendar03Icon as Calendar,
  HashtagIcon as Hash,
  Note01Icon as Note,
  Search01Icon as Search,
  Location01Icon as Location,
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
import { cn } from '@/lib/utils'
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
import { EditableAvatar } from '@/components/ui/editable-avatar'
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

const COLORS = [
  '#0066cc',
  '#34C759',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#5856D6',
  '#8E8E93',
]

export default function OnboardingPage() {
  const t = useTranslations('Onboarding')
  const tc = useTranslations('Common')

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    businessEmail: '',
    businessPhone: '',
    businessAddress: '',
    businessColor: '#0066cc',
    businessLogoUrl: null as string | null,
    currency: '₹',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '12h',
    timeZone: 'Asia/Kolkata',
    language: 'en',
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
      language: profile.language || 'en',
      remindersPerDay: profile.reminders_per_day.toString(),
      defaultReminderDays: profile.default_reminder_days.toString(),
    }))
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, 5))
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
    (step === 3 && isBusinessPhoneValid)
  const preferenceFields: Array<{
    id: string
    key: 'currency' | 'language' | 'dateFormat' | 'timeFormat' | 'timeZone'
    label: string
    options: Array<{ value: string; label: string }>
  }> = [
    {
      id: 'currency',
      key: 'currency',
      label: t('currency'),
      options: CURRENCY_OPTIONS,
    },
    {
      id: 'language',
      key: 'language',
      label: t('language'),
      options: LANGUAGE_OPTIONS,
    },
    {
      id: 'date-format',
      key: 'dateFormat',
      label: t('dateFormat'),
      options: DATE_FORMAT_OPTIONS,
    },
    {
      id: 'time-format',
      key: 'timeFormat',
      label: t('timeFormat'),
      options: timeFormatOptions,
    },
    {
      id: 'time-zone',
      key: 'timeZone',
      label: t('timeZone'),
      options: TIMEZONE_OPTIONS,
    },
  ]

  const handleFinish = async () => {
    setIsSubmitting(true)
    try {
      // 1. Create Business
      const business = await businessService.create({
        name: formData.businessName,
        email: formData.businessEmail || null,
        phone: formData.businessPhone || null,
        address: formData.businessAddress || null,
        color: formData.businessColor,
        logo_url: formData.businessLogoUrl,
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
    <div className="min-h-full bg-background dark:bg-black selection:bg-primary/10 transition-colors duration-500">
      <ClipboardGuard />
      <div className="mx-auto max-w-2xl px-6 py-12 md:py-24 space-y-12">
        {/* Header */}
        <div className="flex items-center justify-center min-h-[64px]">
          <div className="text-center" data-testid="onboarding-heading">
            {step < 5 ? (
              <h1 className="text-display-md md:text-display-lg font-semibold tracking-tight text-ink dark:text-white flex items-center justify-center gap-3">
                {step === 1 && (
                  <HugeiconsIcon
                    icon={Wallet}
                    className="h-8 w-8 text-primary"
                  />
                )}
                {step === 2 && (
                  <HugeiconsIcon
                    icon={Settings2}
                    className="h-8 w-8 text-primary"
                  />
                )}
                {step === 3 && (
                  <HugeiconsIcon
                    icon={Building2}
                    className="h-8 w-8 text-primary"
                  />
                )}
                {step === 4 && (
                  <HugeiconsIcon icon={Bell} className="h-8 w-8 text-primary" />
                )}
                <span>
                  {step === 1 && t('welcome')}
                  {step === 2 && t('personalizeExperience')}
                  {step === 3 && t('businessDetails')}
                  {step === 4 && t('notifications')}
                </span>
              </h1>
            ) : (
              <h1 className="text-display-lg font-semibold tracking-tight text-ink dark:text-white">
                {t('allSet')}
              </h1>
            )}
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
                    {4 > index + 1 && (
                      <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                    )}
                  </StepperItem>
                ))}
              </StepperNav>

              <Button
                variant="ghost"
                size="icon"
                onClick={nextStep}
                disabled={!canAdvance}
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
                className="space-y-8"
              >
                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-3 py-2">
                    <EditableAvatar
                      name={formData.businessName}
                      color={formData.businessColor}
                      imageUrl={formData.businessLogoUrl}
                      onUpload={async (url) =>
                        setFormData((prev) => ({
                          ...prev,
                          businessLogoUrl: url,
                        }))
                      }
                      onDelete={async () =>
                        setFormData((prev) => ({
                          ...prev,
                          businessLogoUrl: null,
                        }))
                      }
                      size="xl"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('businessLogo')}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label
                      htmlFor="onboarding-business-name"
                      required
                      className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1"
                    >
                      {t('businessName')}
                    </Label>
                    <div className="relative group">
                      <HugeiconsIcon
                        icon={Building2}
                        className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary"
                      />
                      <Input
                        id="onboarding-business-name"
                        leftIcon={TextIcon}
                        data-testid="onboarding-business-name-input"
                        placeholder={t('businessNamePlaceholder')}
                        value={formData.businessName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            businessName: e.target.value,
                          })
                        }
                        className="h-14 pl-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none text-xl font-medium rounded-sm transition-all focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                      {t('brandColor')}
                    </Label>
                    <div
                      className="flex flex-nowrap items-center justify-between gap-2 p-1 sm:justify-start sm:gap-3"
                      data-testid="onboarding-brand-colors"
                    >
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={c}
                          aria-pressed={formData.businessColor === c}
                          onClick={() =>
                            setFormData({ ...formData, businessColor: c })
                          }
                          className={cn(
                            'size-10 shrink-0 rounded-full transition-all active:scale-95 ring-offset-2 dark:ring-offset-black',
                            formData.businessColor === c
                              ? 'ring-2 ring-primary scale-110'
                              : 'hover:scale-105 opacity-80 hover:opacity-100',
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full rounded-pill h-14 text-lg font-medium active:scale-95 transition-transform"
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
                  className="grid min-w-0 grid-cols-1 gap-6"
                  data-testid="onboarding-preferences"
                >
                  {preferenceFields.map((field) => (
                    <div key={field.id} className="min-w-0 space-y-2">
                      <Label
                        htmlFor={`onboarding-${field.id}`}
                        required
                        className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1"
                      >
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
                        className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
                      />
                      {!formData[field.key] && (
                        <p className="text-xs text-destructive ml-1">
                          {t('fieldRequired')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full rounded-pill h-14 text-lg font-medium active:scale-95 transition-transform"
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
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                      {t('businessEmail')}
                    </Label>
                    <div className="relative group">
                      <HugeiconsIcon
                        icon={Mail}
                        className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors"
                      />
                      <Input
                        leftIcon={Mail}
                        type="email"
                        placeholder={t('businessEmailPlaceholder')}
                        value={formData.businessEmail}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            businessEmail: e.target.value,
                          })
                        }
                        className="h-14 pl-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none text-lg rounded-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                      {t('businessPhone')}
                    </Label>
                    <PhoneInput
                      placeholder={t('businessPhonePlaceholder')}
                      value={formData.businessPhone}
                      onChange={(businessPhone) =>
                        setFormData((prev) => ({ ...prev, businessPhone }))
                      }
                      aria-invalid={!isBusinessPhoneValid}
                      className="dark:bg-surface-tile-1 text-lg"
                    />
                    {!isBusinessPhoneValid && (
                      <p className="text-xs text-destructive ml-1">
                        {tc('invalidPhone')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                      {t('headquarters')}
                    </Label>
                    <div className="relative group">
                      <HugeiconsIcon
                        icon={MapPin}
                        className="absolute left-5 top-5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors"
                      />
                      <Input
                        leftIcon={TextIcon}
                        placeholder={t('headquartersPlaceholder')}
                        value={formData.businessAddress}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            businessAddress: e.target.value,
                          })
                        }
                        className="h-14 pl-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none text-lg rounded-sm"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full rounded-pill h-14 text-lg font-medium active:scale-95 transition-transform"
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
                className="space-y-8"
              >
                <div className="space-y-6">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
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
                      onValueChange={(v) =>
                        setFormData({ ...formData, remindersPerDay: v })
                      }
                      className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
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
                      onValueChange={(v) =>
                        setFormData({ ...formData, defaultReminderDays: v })
                      }
                      className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
                    />
                  </div>
                </div>

                <div className="p-6 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/10 space-y-4">
                  <div className="flex items-center gap-4">
                    <EntityAvatar
                      name={formData.businessName}
                      color={formData.businessColor}
                      imageUrl={formData.businessLogoUrl}
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

                <Button
                  className="w-full rounded-pill h-14 text-lg font-medium active:scale-95 transition-transform"
                  data-testid="onboarding-step4-finish"
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                >
                  {t('finishSetup')}{' '}
                  <HugeiconsIcon icon={Check} className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 5 && (
              <CreationSuccessScreen
                key="step5"
                title={t('readyToGo')}
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
