'use client'

import { useCreateBusiness } from '@/features/businesses/hooks/use-create-business'
import { Button } from '@/components/ui/button'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import {
  UserIcon as User,
  Mail01Icon as Mail,
  LockPasswordIcon as Lock,
  CallIcon as Phone,
  Calendar03Icon as Calendar,
  HashtagIcon as Hash,
  Note01Icon as Note,
  Building03Icon as Building,
  Wallet01Icon as Wallet,
  Search01Icon as Search,
  Location01Icon as Location,
  TextFontIcon as TextIcon,
  ArrowLeft01Icon as ArrowLeft,
  Tick02Icon as Check,
  Building03Icon as Building2,
  Location01Icon as MapPin,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BUSINESS_THEME_COLORS,
  ThemeColorRow,
} from '@/components/ui/theme-color-row'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper'
import { useTranslations } from 'next-intl'
import { useValidationMessage } from '@/hooks/use-validation-message'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { PhoneInput } from '@/components/ui/phone-input'
import { Controller } from 'react-hook-form'
import { CreationSuccessScreen } from '@/components/ui/creation-success-screen'

export default function CreateBusinessPage() {
  const validationMessage = useValidationMessage()
  const t = useTranslations('Businesses')
  const tc = useTranslations('Common')
  const router = useRouter()

  const {
    form,
    step,
    nextStep,
    prevStep,
    isSaving,
    isSuccess,
    continueAfterSuccess,
    onSubmit,
  } = useCreateBusiness()

  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form

  if (isSuccess) {
    return (
      <div className="max-w-2xl">
        <CreationSuccessScreen
          title={t('successTitle')}
          description={t('successDescription')}
          ctaLabel={t('successCta')}
          onContinue={continueAfterSuccess}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3 pb-24">
      <Stepper
        value={step}
        className="w-full max-w-xl mx-auto space-y-3"
        indicators={{
          completed: <HugeiconsIcon icon={Check} className="size-3.5" />,
        }}
      >
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevStep}
            disabled={step === 1}
            className="rounded-full h-8 w-8 shrink-0 hover:bg-canvas-parchment"
          >
            <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
          </Button>

          <StepperNav className="gap-3 flex-1">
            {[
              {
                title: t('businessProfile'),
                icon: <HugeiconsIcon icon={Building2} className="size-4" />,
              },
              {
                title: t('contactInfo'),
                icon: <HugeiconsIcon icon={Phone} className="size-4" />,
              },
              {
                title: t('location'),
                icon: <HugeiconsIcon icon={MapPin} className="size-4" />,
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
                {3 > index + 1 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-x-0 left-[50%] top-4 m-0 w-full z-0" />
                )}
              </StepperItem>
            ))}
          </StepperNav>
        </div>
      </Stepper>

      <form
        id="business-create-form"
        onSubmit={(event) => {
          if (step < 3) {
            event.preventDefault()
            void nextStep()
          } else {
            void onSubmit(event)
          }
        }}
        className="space-y-3"
      >
        {step === 1 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-3" data-testid="business-step1-fields">
              <div className="space-y-2" data-testid="business-logo-field">
                <div className="flex flex-col items-center gap-3 py-2">
                  <EditableAvatar
                    name={watch('name') || t('businessName')}
                    color={watch('color')}
                    imageUrl={watch('logo_url')}
                    onUpload={async (url) => setValue('logo_url', url)}
                    onDelete={async () => setValue('logo_url', null)}
                    size="xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('businessLogo')}
                  </p>
                </div>
              </div>

              <div className="space-y-2" data-testid="business-name-field">
                <Label
                  required
                  htmlFor="name"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  {t('businessName')}
                </Label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Building2}
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
                  />
                  <Input
                    leftIcon={User}
                    id="name"
                    {...register('name')}
                    placeholder={t('businessNamePlaceholder')}
                    className="h-14  bg-canvas-parchment border-none text-lg font-semibold rounded-sm"
                  />
                </div>
                {errors.name && (
                  <FieldError>
                    {validationMessage(errors.name.message)}
                  </FieldError>
                )}
              </div>

              <ThemeColorRow
                label={tc('themeColor')}
                colors={BUSINESS_THEME_COLORS}
                value={watch('color')}
                onChange={(color) =>
                  setValue('color', color, { shouldDirty: true })
                }
                testId="business-theme-color-field"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('businessEmail')}
              </Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Mail}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50"
                />
                <Input
                  leftIcon={Mail}
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder={t('contactEmailPlaceholder')}
                  className="h-14  bg-canvas-parchment border-none rounded-sm"
                />
              </div>
              {errors.email && (
                <FieldError>
                  {validationMessage(errors.email.message)}
                </FieldError>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="phone"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('businessPhone')}
              </Label>
              <Controller
                control={control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('businessPhone')}
                    aria-invalid={!!errors.phone}
                  />
                )}
              />
              {errors.phone && (
                <FieldError>
                  {validationMessage(errors.phone.message)}
                </FieldError>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label
                htmlFor="address"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                {t('businessAddress')}
              </Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={MapPin}
                  className="absolute left-4 top-4 h-5 w-5 text-muted-foreground opacity-50"
                />
                <Input
                  leftIcon={MapPin}
                  id="address"
                  {...register('address')}
                  placeholder={t('headquartersPlaceholder')}
                  className="h-14  bg-canvas-parchment border-none rounded-sm"
                />
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 p-6 space-y-4 border border-primary/10">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Building2}
                  className="h-3 w-3 text-primary opacity-80"
                />
                <h3 className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  {t('businessSummary')}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{
                    backgroundColor: (watch as any)('color') || '#007AFF',
                  }}
                >
                  {watch('name')?.charAt(0) || 'B'}
                </div>
                <div>
                  <p className="font-semibold">{watch('name')}</p>
                  <p className="text-xs text-muted-foreground">
                    {watch('email')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>

      <EditSaveBar
        formId="business-create-form"
        label={step < 3 ? tc('continue') : t('newBusiness')}
        isContinue={step < 3}
        disabled={
          step === 1 ? !watch('name') : step === 2 ? !watch('email') : false
        }
        isDirty={true}
        isSaving={isSaving || form.formState.isSubmitting}
        testId={
          step < 3 ? `business-step${step}-continue` : 'business-submit-button'
        }
      />
    </div>
  )
}
