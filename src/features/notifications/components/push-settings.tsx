'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { pushService, type PushState } from '../services/push.service'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { queryKeys } from '@/lib/query-keys'

export function PushSettings() {
  const t = useTranslations('Push')
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
      className="space-y-2 rounded-xl border p-4"
      aria-label={t('title')}
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-sm">{t('privacy')}</p>
      {error && (
        <>
          <p role="alert">{t('error')}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError(false)
              setAttempt(attempt + 1)
            }}
          >
            {t('retry')}
          </Button>
        </>
      )}
      {state && <p role="status">{t(`states.${state}`)}</p>}
      <Button
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
    </section>
  )
}
