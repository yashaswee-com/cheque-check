'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { authService } from '../services/auth.service'
import { logger } from '@/lib/logger'
import { toast } from '@/components/ui/toast'
import { maskPhone } from '@/lib/phone-auth'
import { PhoneAuthForm } from './phone-auth-form'
import { publicEnv } from '@/lib/env/client'
import { SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { ContactField } from './contact-field'

export function LoginPhoneSection({
  enabled = publicEnv.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true',
  primary = false,
}: {
  enabled?: boolean
  primary?: boolean
}) {
  const t = useTranslations('PhoneAuth')
  const [phone, setPhone] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [linked, setLinked] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const user = await authService.getUser()
      setPhone(
        user?.phone && user.phone_confirmed_at
          ? `+${user.phone.replace(/^\+/, '')}`
          : null,
      )
    } catch (error) {
      logger.error('Failed to load linked login phone', error)
      toast.add({ title: t('errors.unknown'), type: 'error' })
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return (
    <ContactField
      id="verified-phone"
      testId="login-phone-section"
      label={t('linkTitle')}
      icon={SmartPhone01Icon}
      value={phone ?? ''}
      placeholder={t('notLinked')}
      verified={!!phone}
      hint={
        phone
          ? primary
            ? t('signInPhone')
            : t('linkedAs', { phone: maskPhone(phone) })
          : t('notLinked')
      }
    >
      {!primary && !phone && (
        <p className="ml-1 text-xs text-muted-foreground">
          {t('linkDescription')}
        </p>
      )}
      {!enabled && !primary && (
        <p className="ml-1 text-xs text-muted-foreground">
          {t('linkDisabled')}
        </p>
      )}
      {linked && (
        <p role="status" className="ml-1 text-sm text-green-600">
          {t('linkSuccess')}
        </p>
      )}
      {editing && enabled ? (
        <PhoneAuthForm
          purpose="link"
          onCancel={() => setEditing(false)}
          onVerified={() => {
            setEditing(false)
            setLinked(true)
            void refresh()
          }}
        />
      ) : primary ? null : (
        <Button
          type="button"
          disabled={!enabled}
          variant="outline"
          className="w-full"
          data-testid="login-phone-link-button"
          onClick={() => {
            setLinked(false)
            setEditing(true)
          }}
        >
          {phone ? t('changeAction') : t('linkAction')}
        </Button>
      )}
    </ContactField>
  )
}
