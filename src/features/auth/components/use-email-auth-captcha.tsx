'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { publicEnv } from '@/lib/env/client'
import { TurnstileWidget } from './turnstile-widget'

/** Email auth and PIN reauthentication share Supabase's CAPTCHA policy. */
export function useEmailAuthCaptcha(
  action: 'email_signup' | 'email_login' | 'email_reset' | 'security_pin',
) {
  const t = useTranslations('PhoneAuth')
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const [token, setToken] = useState<string | null>(null)
  const [key, setKey] = useState(0)

  const reset = () => {
    setToken(null)
    setKey((value) => value + 1)
  }

  return {
    token: token ?? undefined,
    required: Boolean(siteKey),
    reset,
    challenge: siteKey ? (
      <div className="space-y-1" aria-label={t('securityCheck')}>
        <TurnstileWidget
          key={key}
          siteKey={siteKey}
          action={action}
          onToken={setToken}
        />
      </div>
    ) : null,
  }
}
