'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { pushService, type PushState } from '../services/push.service'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { logger } from '@/lib/logger'
import { queryKeys } from '@/lib/query-keys'

export function PushSettings({
  enabled,
  disabled,
  onEnabledChange,
}: {
  enabled: boolean
  disabled: boolean
  onEnabledChange: (enabled: boolean) => void
}) {
  const t = useTranslations('Push')
  const settings = useTranslations('Settings')
  const { profile } = useProfile()
  const client = useQueryClient()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const lock = useRef(false)
  const userId = profile?.user_id
  useEffect(() => {
    let live = true
    if (userId)
      void pushService
        .state()
        .then((value) => {
          if (live) setState(value)
        })
        .catch((error) => {
          logger.error('Push settings failed to load', error)
          if (live) setError(true)
        })
    return () => {
      live = false
    }
  }, [userId, attempt])
  const perform = async () => {
    if (!profile || lock.current) return
    lock.current = true
    setBusy(true)
    setError(false)
    try {
      if (state === 'enabled') await pushService.disable()
      else await pushService.enable(profile.user_id)
      setState(await pushService.state())
      await client.invalidateQueries({ queryKey: queryKeys.profile.detail() })
    } catch (error) {
      logger.error('Push preference failed', error)
      setError(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label={settings('pushNotifications')}
    >
      <div className="min-w-0 space-y-1">
        <Label>{settings('pushNotifications')}</Label>
        <p className="text-xs text-muted-foreground">{t('privacy')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {state && (
            <p role="status" className="text-xs text-muted-foreground">
              {t(`states.${state}`)}
            </p>
          )}
          <Button
            variant="link"
            className="h-auto p-0 text-xs"
            disabled={
              busy ||
              !profile ||
              !state ||
              !['available', 'enabled'].includes(state)
            }
            onClick={() => void perform()}
          >
            {state === 'enabled' ? t('disable') : t('enable')}
          </Button>
        </div>
        {error && (
          <div className="flex items-center gap-2">
            <p role="alert" className="text-xs text-destructive">
              {t('error')}
            </p>
            <Button
              variant="link"
              className="h-auto p-0 text-xs"
              disabled={busy}
              onClick={() => {
                setError(false)
                setAttempt(attempt + 1)
              }}
            >
              {t('retry')}
            </Button>
          </div>
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onEnabledChange}
        disabled={disabled}
        aria-label={settings('pushNotifications')}
        data-testid="notifications-toggle-push_enabled"
      />
    </section>
  )
}
