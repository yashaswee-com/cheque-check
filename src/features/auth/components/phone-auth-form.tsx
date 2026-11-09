'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp'
import { PencilEdit01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { publicEnv } from '@/lib/env/client'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import {
  OTP_LENGTH,
  checkIndianMobile,
  maskPhone,
  normalizeOtp,
  type PhoneAuthPurpose,
} from '@/lib/phone-auth'
import { authService } from '@/features/auth/services/auth.service'
import type { PhoneAuthErrorCode } from '@/features/auth/phone-auth.types'
import { TurnstileWidget } from '@/features/auth/components/turnstile-widget'

type Step = 'phone' | 'code'
type Pending = 'send' | 'resend' | 'verify' | null
type FormError = PhoneAuthErrorCode | 'captcha_required' | 'name_required'

interface PhoneAuthFormProps {
  purpose: PhoneAuthPurpose
  onVerified: (phone: string) => void
  onCancel?: () => void
  showSignupHint?: boolean
}

export function PhoneAuthForm({
  purpose,
  onVerified,
  onCancel,
  showSignupHint = false,
}: PhoneAuthFormProps) {
  const t = useTranslations('PhoneAuth')
  const tc = useTranslations('Common')
  const ta = useTranslations('Auth')
  const ids = useId()
  const nameId = `${ids}-name`
  const phoneId = `${ids}-phone`
  const codeId = `${ids}-code`
  const errorId = `${ids}-error`

  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const needsCaptcha = purpose !== 'link' && Boolean(siteKey)

  const [step, setStep] = useState<Step>('phone')
  const [national, setNational] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<FormError | null>(null)
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const busy = useRef(false)

  useEffect(() => {
    if (!cooldownEndsAt) return
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownEndsAt - Date.now()) / 1000),
      )
      setSecondsLeft(remaining)
      return remaining
    }
    if (tick() === 0) return
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownEndsAt])

  const focusField = useCallback((id: string) => {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }, [])

  const reportError = (nextError: FormError) => {
    setError(nextError)
    toast.add({
      title: t('errorTitle'),
      description: t(`errors.${nextError}`),
      type: 'error',
    })
  }

  const requestCode = async (target: string, kind: 'send' | 'resend') => {
    if (busy.current) return
    if (needsCaptcha && !captchaToken) {
      reportError('captcha_required')
      return
    }
    busy.current = true
    setPending(kind)
    setError(null)
    try {
      const result = await authService.sendPhoneOtp({
        phone: target,
        purpose,
        captchaToken: captchaToken ?? undefined,
        ...(purpose === 'signup' ? { name: name.trim() } : {}),
      })
      if (result.ok) {
        setPhone(result.phone)
        setStep('code')
        setCode('')
        setCooldownEndsAt(Date.now() + result.resendAfterSeconds * 1000)
        focusField(codeId)
      } else {
        reportError(result.code)
        if (result.code === 'rate_limited' && result.retryAfterSeconds) {
          setCooldownEndsAt(
            Date.now() + Math.min(result.retryAfterSeconds, 300) * 1000,
          )
        }
      }
    } catch {
      reportError('unknown')
    } finally {
      // Captcha tokens are single-use.
      setCaptchaToken(null)
      setCaptchaKey((key) => key + 1)
      busy.current = false
      setPending(null)
    }
  }

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault()
    if (purpose === 'signup' && !name.trim()) {
      reportError('name_required')
      focusField(nameId)
      return
    }
    const checked = checkIndianMobile(national)
    if (!checked.ok) {
      reportError(
        checked.reason === 'unsupported_country'
          ? 'unsupported_country'
          : 'invalid_phone',
      )
      focusField(phoneId)
      return
    }
    void requestCode(checked.e164, 'send')
  }

  const verifyCode = async (value: string) => {
    if (busy.current) return
    const token = normalizeOtp(value)
    if (!token) {
      reportError('invalid_or_expired_code')
      focusField(codeId)
      return
    }
    busy.current = true
    setPending('verify')
    setError(null)
    try {
      const result = await authService.verifyPhoneOtp({
        phone,
        token,
        purpose,
      })
      if (result.ok) {
        onVerified(result.phone)
        return
      }
      reportError(result.code)
      if (result.code === 'invalid_or_expired_code') {
        setCode('')
        focusField(codeId)
      }
    } catch {
      reportError('unknown')
    } finally {
      busy.current = false
      setPending(null)
    }
  }

  const handleVerify = (event: React.FormEvent) => {
    event.preventDefault()
    void verifyCode(code)
  }

  const editNumber = () => {
    setStep('phone')
    setCode('')
    setError(null)
    focusField(phoneId)
  }

  const errorMessage = error ? t(`errors.${error}`) : null
  const captcha =
    needsCaptcha && siteKey ? (
      <div className="space-y-1" aria-label={t('securityCheck')}>
        <TurnstileWidget
          key={captchaKey}
          siteKey={siteKey}
          action={`phone_${purpose}`}
          onToken={setCaptchaToken}
        />
      </div>
    ) : null

  const errorBlock = errorMessage ? (
    <p
      id={errorId}
      role="alert"
      data-testid="phone-auth-error"
      className="text-sm text-destructive"
    >
      {errorMessage}
    </p>
  ) : null

  if (step === 'phone') {
    return (
      <form onSubmit={handleSend} className="space-y-4" noValidate>
        {purpose === 'signup' && (
          <div className="space-y-2">
            <Label htmlFor={nameId}>{tc('fullName')}</Label>
            <Input
              id={nameId}
              type="text"
              autoComplete="name"
              data-testid="phone-auth-name-input"
              placeholder={ta('namePlaceholder')}
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              aria-invalid={error === 'name_required'}
              aria-describedby={error === 'name_required' ? errorId : undefined}
              className="h-12 rounded-sm border-none bg-canvas-parchment"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={phoneId}>{t('phoneLabel')}</Label>
          <div
            className="flex items-center gap-2"
            data-testid="phone-auth-number-field"
          >
            <span
              className="flex h-12 shrink-0 items-center rounded-sm bg-canvas-parchment px-3 text-sm font-medium"
              aria-label={t('countryCode')}
            >
              +91
            </span>
            <Input
              id={phoneId}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              data-testid="phone-auth-number-input"
              placeholder={t('phonePlaceholder')}
              value={national}
              maxLength={16}
              onChange={(event) => {
                setNational(event.target.value)
                setError(null)
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : `${phoneId}-hint`}
              className="h-12 rounded-sm border-none bg-canvas-parchment"
            />
          </div>
          <p id={`${phoneId}-hint`} className="text-xs text-muted-foreground">
            {t('phoneHint')}
          </p>
          {showSignupHint && (
            <p className="text-xs text-muted-foreground">{t('signupHint')}</p>
          )}
        </div>
        {captcha}
        {errorBlock}
        <div className="flex gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 rounded-full"
              onClick={onCancel}
              disabled={pending !== null}
            >
              {t('cancel')}
            </Button>
          )}
          <Button
            type="submit"
            data-testid="phone-auth-send-button"
            className="h-12 flex-1 rounded-full text-lg"
            loading={pending === 'send'}
            disabled={pending !== null}
          >
            {t('sendCode')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={codeId}>{t('codeLabel')}</Label>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('codeSentTo', { phone: maskPhone(phone) })}
        </p>
        <OTPInput
          id={codeId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          data-testid="phone-auth-code-input"
          maxLength={OTP_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          pasteTransformer={(value) => value.replace(/\D/g, '')}
          value={code}
          onChange={(value) => {
            setCode(value)
            setError(null)
            if (normalizeOtp(value)) void verifyCode(value)
          }}
          disabled={pending !== null}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : `${codeId}-hint`}
          containerClassName="w-full has-[:disabled]:opacity-50"
          render={({ slots }) => (
            <div
              className="grid w-full grid-cols-6 gap-2"
              data-testid="phone-auth-code-slots"
              aria-hidden="true"
            >
              {slots.map((slot, index) => (
                <div
                  key={index}
                  data-slot="otp-slot"
                  className={cn(
                    'relative flex h-12 min-w-0 items-center justify-center rounded-sm border border-border bg-canvas-parchment text-lg font-medium tabular-nums',
                    error && 'border-destructive',
                    slot.isActive && 'border-ring ring-2 ring-ring/50',
                  )}
                >
                  {slot.char}
                  {slot.hasFakeCaret && (
                    <span className="absolute h-5 w-px animate-pulse bg-foreground motion-reduce:animate-none" />
                  )}
                </div>
              ))}
            </div>
          )}
        />
        <p id={`${codeId}-hint`} className="text-xs text-muted-foreground">
          {t('codeExpiryHint')}
        </p>
      </div>
      {captcha}
      {errorBlock}
      <Button
        type="submit"
        data-testid="phone-auth-verify-button"
        className="h-12 w-full rounded-full text-lg"
        loading={pending === 'verify'}
        disabled={pending !== null || code.length !== OTP_LENGTH}
      >
        {purpose === 'link' ? t('linkVerify') : t('verify')}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-10 max-w-full whitespace-normal px-0 text-left"
          onClick={editNumber}
          disabled={pending !== null}
        >
          <HugeiconsIcon
            icon={PencilEdit01Icon}
            className="size-4"
            aria-hidden="true"
          />
          {t('editNumber')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-10 max-w-full whitespace-normal px-0 text-right"
          data-testid="phone-auth-resend-button"
          onClick={() => void requestCode(phone, 'resend')}
          loading={pending === 'resend'}
          disabled={pending !== null || secondsLeft > 0}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            className="size-4"
            aria-hidden="true"
          />
          {secondsLeft > 0
            ? t('resendIn', { seconds: secondsLeft })
            : t('resend')}
        </Button>
      </div>
    </form>
  )
}
