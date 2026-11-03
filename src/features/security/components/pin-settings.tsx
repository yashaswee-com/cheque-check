'use client'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  LockSync01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { usePinActions } from '../hooks/use-pin-security'
import { SecurityError, type SecurityStatus } from '../types'
import {
  PIN_LOCK_TIMEOUTS,
  pinSchema,
  type PinLockTimeout,
} from '../validators/security'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'
import { InfoPopover } from '@/components/ui/info-popover'
import { cn } from '@/lib/utils'

type PinMode = 'on' | 'off' | 'change'
const modeTitle = { on: 'turnOn', off: 'turnOff', change: 'changePin' } as const
const pinInputClass = 'h-12 text-center text-lg tracking-[0.5em]'

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
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState(''),
    [token, setToken] = useState(''),
    [pin, setPin] = useState(''),
    [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [sent, setSent] = useState<'email' | 'phone' | null>(null),
    [saved, setSaved] = useState<'saved' | 'timeoutSaved' | null>(null),
    [mode, setMode] = useState<PinMode | null>(null)
  const load = useCallback(
    (isActive: () => boolean = () => true) =>
      getStatus()
        .then((status) => {
          if (isActive()) setStatus(status)
        })
        .catch((error) => {
          logger.error('PIN settings unavailable', error)
          if (isActive()) setError('unavailable')
        }),
    [getStatus],
  )
  useEffect(() => {
    let active = true
    void load(() => active)
    return () => {
      active = false
    }
  }, [load])
  const perform = async (task: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(null)
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
  const clearFlow = () => {
    setPin('')
    setConfirm('')
    setPassword('')
    setToken('')
    setProof(null)
    setSent(null)
    setUsePassword(false)
  }
  const start = (next: PinMode) => {
    clearFlow()
    setError(null)
    setSaved(null)
    setMode(next)
  }
  const cancel = () => {
    clearFlow()
    setError(null)
    setMode(null)
  }
  const done = () => {
    clearFlow()
    setMode(null)
    setSaved('saved')
    void load()
    onDone?.()
  }
  const chooseTimeout = (seconds: PinLockTimeout) =>
    void perform(async () => {
      await actions.timeout(seconds)
      setStatus((current) =>
        current ? { ...current, lockTimeoutSeconds: seconds } : current,
      )
      setSaved('timeoutSaved')
    })
  const on = Boolean(status?.enabled)
  const noIdentity = Boolean(status && !status.emailOtp && !status.phoneOtp)
  const flowOpen = recovery || mode !== null
  const timeoutLabelId = 'pin-timeout-label'
  const verification = (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium">{t('chooseVerification')}</p>
        <InfoPopover
          title={t('chooseVerification')}
          positionerClassName={recovery ? 'z-[2147483646]' : undefined}
        >
          {t('freshAuth')} {t('passwordlessHelp')}
        </InfoPopover>
      </div>
      {usePassword && (
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
            className="w-full"
            disabled={busy || !status || noIdentity}
          >
            {t('authenticate')}
          </Button>
        </form>
      )}
      <div className="flex flex-col gap-2">
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
                    setUsePassword(false)
                    setPassword('')
                    setToken('')
                  })
                }
              >
                {t(channel === 'email' ? 'emailCode' : 'phoneCode')}
              </Button>
            ),
        )}
        {status && !noIdentity && !usePassword && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setUsePassword(true)
              setSent(null)
              setToken('')
            }}
          >
            {t('usePassword')}
          </Button>
        )}
      </div>
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
          <p role="status" className="text-sm text-muted-foreground">
            {t('codeSent')}
          </p>
          <Label htmlFor="pin-auth-code">{t('authCode')}</Label>
          <Input
            id="pin-auth-code"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            minLength={6}
            maxLength={10}
            className={pinInputClass}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            disabled={busy}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {t('authenticate')}
          </Button>
        </form>
      )}
    </div>
  )
  const pinForm = (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void perform(async () => {
          if (!pinSchema.safeParse(pin).success || pin !== confirm) {
            setError('pin_mismatch')
            return
          }
          if (!proof) return
          await actions.set(proof, pin)
          done()
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="new-pin">{t('newPin')}</Label>
        <Input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          className={pinInputClass}
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-pin">{t('confirmPin')}</Label>
        <Input
          id="confirm-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          className={pinInputClass}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={busy}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {t('savePin')}
      </Button>
    </form>
  )
  const remove = () =>
    void perform(async () => {
      if (!proof) return
      await actions.remove(proof)
      done()
    })
  return (
    <section
      className={cn('space-y-4', !recovery && 'max-w-2xl pb-20')}
      data-sentry-mask
      data-clarity-mask="true"
    >
      {recovery ? (
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-semibold">{t('resetTitle')}</h2>
          <InfoPopover
            title={t('pinTitle')}
            positionerClassName="z-[2147483646]"
          >
            {t('pinLimit')}
          </InfoPopover>
        </div>
      ) : (
        <div
          data-testid="pin-status-card"
          className="flex items-start gap-4 rounded-2xl border bg-card p-5"
        >
          <span
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              on
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <HugeiconsIcon
              icon={on ? SquareLock02Icon : SquareUnlock02Icon}
              className="h-6 w-6"
            />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1">
              <h2 className="text-lg font-semibold">{t('pinTitle')}</h2>
              <InfoPopover title={t('pinTitle')}>{t('pinLimit')}</InfoPopover>
              {status && (
                <span
                  data-testid="pin-status-badge"
                  className={cn(
                    'ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    on
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t(on ? 'statusOn' : 'statusOff')}
                </span>
              )}
            </div>
            {status && (
              <p className="text-sm text-muted-foreground">
                {t(on ? 'pinSummaryOn' : 'pinSummaryOff')}
              </p>
            )}
          </div>
        </div>
      )}
      {noIdentity && <p role="alert">{t('identity_unavailable')}</p>}
      {!recovery && status && !mode && (
        <div
          data-testid="pin-actions"
          className="divide-y overflow-hidden rounded-2xl border bg-card"
        >
          {(on ? (['change', 'off'] as const) : (['on'] as const)).map(
            (action) => (
              <button
                key={action}
                type="button"
                disabled={busy || noIdentity}
                onClick={() => start(action)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-4 text-left text-sm font-semibold transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50',
                  action === 'off' && 'text-destructive',
                )}
              >
                <HugeiconsIcon
                  icon={
                    action === 'change'
                      ? LockSync01Icon
                      : action === 'off'
                        ? SquareUnlock02Icon
                        : SquareLock02Icon
                  }
                  className="h-5 w-5 shrink-0"
                />
                <span className="flex-1">{t(modeTitle[action])}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
              </button>
            ),
          )}
        </div>
      )}
      {!recovery && on && !mode && status && (
        <div className="space-y-2" data-testid="pin-timeout">
          <div className="flex items-center gap-1 px-1">
            <h3 id={timeoutLabelId} className="text-sm font-semibold">
              {t('requirePasscode')}
            </h3>
            <InfoPopover title={t('requirePasscode')}>
              {t('requirePasscodeHelp')}
            </InfoPopover>
          </div>
          <div
            role="radiogroup"
            aria-labelledby={timeoutLabelId}
            className="divide-y overflow-hidden rounded-2xl border bg-card"
          >
            {PIN_LOCK_TIMEOUTS.map((seconds) => {
              const selected = status.lockTimeoutSeconds === seconds
              return (
                <button
                  key={seconds}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => !selected && chooseTimeout(seconds)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-muted/40 disabled:opacity-50"
                >
                  <span className={cn('flex-1', selected && 'font-semibold')}>
                    {t('timeoutOption', { minutes: seconds / 60 })}
                  </span>
                  {selected && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="h-4 w-4 stroke-[3] text-primary"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {flowOpen && (
        <div
          data-testid="pin-flow"
          className={cn(
            !recovery && 'space-y-4 rounded-2xl border bg-card p-5',
          )}
        >
          {!recovery && mode && (
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{t(modeTitle[mode])}</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={cancel}
              >
                {t('cancel')}
              </Button>
            </div>
          )}
          {!proof ? (
            verification
          ) : mode === 'off' && !recovery ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('turnOffConfirm')}
              </p>
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={remove}
              >
                {t('turnOff')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {pinForm}
              {recovery && status?.enabled && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={remove}
                >
                  {t('removePin')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert">{t.has(error) ? t(error) : t('unavailable')}</p>
      )}
      {saved && <p role="status">{t(saved)}</p>}
    </section>
  )
}
