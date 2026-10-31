'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { authService } from '../services/auth.service'
import { logger } from '@/lib/logger'
import { toast } from '@/components/ui/toast'
import { maskPhone } from '@/lib/phone-auth'
import { PhoneAuthForm } from './phone-auth-form'

export function LoginPhoneSection() {
  const t = useTranslations('PhoneAuth')
  const [phone, setPhone] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [linked, setLinked] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const user = await authService.getUser()
      setPhone(user?.phone ? `+${user.phone.replace(/^\+/, '')}` : null)
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
    <div className="space-y-3" data-testid="login-phone-section">
      <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('linkTitle')}
      </h3>
      <p className="ml-1 text-xs text-muted-foreground">
        {t('linkDescription')}
      </p>
      <p className="ml-1 text-sm font-medium">
        {phone ? t('linkedAs', { phone: maskPhone(phone) }) : t('notLinked')}
      </p>
      {linked && (
        <p role="status" className="ml-1 text-sm text-green-600">
          {t('linkSuccess')}
        </p>
      )}
      {editing ? (
        <PhoneAuthForm
          purpose="link"
          onCancel={() => setEditing(false)}
          onVerified={() => {
            setEditing(false)
            setLinked(true)
            void refresh()
          }}
        />
      ) : (
        <Button
          type="button"
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
    </div>
  )
}
