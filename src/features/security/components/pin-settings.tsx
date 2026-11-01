'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePinActions } from '../hooks/use-pin-security'
import { SecurityError, type SecurityStatus } from '../types'
import { pinSchema } from '../validators/security'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'

export function PinSettings({
  recovery = false,
  onDone,
}: {
  recovery?: boolean
  onDone?: () => void
}) {
  const t = useTranslations('Security')
  const actions = usePinActions()
  const getStatus = actions.status
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [proof, setProof] = useState<string | null>(null)
  const [password, setPassword] = useState(''),
    [token, setToken] = useState(''),
    [pin, setPin] = useState(''),
    [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [sent, setSent] = useState<'email' | 'phone' | null>(null),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    void getStatus()
      .then((status) => {
        if (active) setStatus(status)
      })
      .catch((error) => {
        logger.error('PIN settings unavailable', error)
        if (active) setError('unavailable')
      })
    return () => {
      active = false
    }
  }, [getStatus])
  const perform = async (task: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await task()
    } catch (error) {
      logger.error('PIN preference action failed', error)
      setError(error instanceof SecurityError ? error.code : 'unavailable')
      if (
        error instanceof SecurityError &&
        error.code === 'fresh_auth_required'
      )
        setProof(null)
    } finally {
      setBusy(false)
    }
  }
  const done = () => {
    setPin('')
    setConfirm('')
    setPassword('')
    setToken('')
    setProof(null)
    setSaved(true)
    onDone?.()
  }
  return (
    <section className="space-y-4" data-sentry-mask data-clarity-mask="true">
      <h2 className="text-lg font-semibold">
        {t(recovery ? 'resetTitle' : 'pinTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('pinLimit')}</p>
      {status && <p>{t(status.enabled ? 'enabled' : 'disabled')}</p>}
      {!proof && (
        <div className="space-y-3">
          <p>{t('freshAuth')}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void perform(async () => {
                const result = await actions.password(password)
                setProof(result.proof)
                setPassword('')
              })
            }}
            className="space-y-2"
          >
            <Label htmlFor="pin-password">{t('password')}</Label>
            <Input
              id="pin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
            />
            <Button
              type="submit"
              disabled={
                busy || !status || (!status.emailOtp && !status.phoneOtp)
              }
            >
              {t('authenticate')}
            </Button>
          </form>
          {(['email', 'phone'] as const).map(
            (channel) =>
              status?.[channel === 'email' ? 'emailOtp' : 'phoneOtp'] && (
                <Button
                  key={channel}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await actions.sendOtp(channel)
                      setSent(channel)
                      setToken('')
                    })
                  }
                >
                  {t(channel === 'email' ? 'emailCode' : 'phoneCode')}
                </Button>
              ),
          )}
          {status && !status.emailOtp && !status.phoneOtp && (
            <p role="alert">{t('identity_unavailable')}</p>
          )}
          {sent && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void perform(async () => {
                  const result = await actions.otp(sent, token)
                  setProof(result.proof)
                  setToken('')
                  setSent(null)
                })
              }}
            >
              <p role="status">{t('codeSent')}</p>
              <Label htmlFor="pin-auth-code">{t('authCode')}</Label>
              <Input
                id="pin-auth-code"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                disabled={busy}
              />
              <Button type="submit" disabled={busy}>
                {t('authenticate')}
              </Button>
            </form>
          )}
        </div>
      )}
      {proof && (
        <div className="space-y-3">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              void perform(async () => {
                if (!pinSchema.safeParse(pin).success || pin !== confirm) {
                  setError('pin_mismatch')
                  return
                }
                await actions.set(proof, pin)
                done()
              })
            }}
          >
            <Label htmlFor="new-pin">{t('newPin')}</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              disabled={busy}
              required
            />
            <Label htmlFor="confirm-pin">{t('confirmPin')}</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={busy}
              required
            />
            <Button type="submit" disabled={busy}>
              {t('savePin')}
            </Button>
          </form>
          {status?.enabled && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await actions.remove(proof)
                  done()
                })
              }
            >
              {t('removePin')}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert">{t.has(error) ? t(error) : t('unavailable')}</p>
      )}
      {saved && <p role="status">{t('saved')}</p>}
    </section>
  )
}
