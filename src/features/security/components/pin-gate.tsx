'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePinGate } from '../hooks/use-pin-security'
import { PinSettings } from './pin-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
export function PinGate({ children }: { children: React.ReactNode }) {
  const gate = usePinGate()
  const t = useTranslations('Security')
  const [pin, setPin] = useState(''),
    [recover, setRecover] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const checkingHints = t.raw('checkingHints') as string[]

  useEffect(() => {
    if (!gate.loading || checkingHints.length < 2) return

    let timer: number
    const scheduleNextHint = () => {
      const delay = 3000 + Math.floor(Math.random() * 2001)
      timer = window.setTimeout(() => {
        setHintIndex((current) => {
          const nextOffset =
            1 + Math.floor(Math.random() * (checkingHints.length - 1))
          return (current + nextOffset) % checkingHints.length
        })
        scheduleNextHint()
      }, delay)
    }

    scheduleNextHint()
    return () => window.clearTimeout(timer)
  }, [gate.loading, checkingHints.length])

  if (gate.canEnter) return children
  return (
    <Dialog open disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        scrollable
        overlayClassName="z-[2147483645] bg-background supports-backdrop-filter:backdrop-blur-none"
        className="z-[2147483646] max-h-[90dvh]"
        data-sentry-mask
        data-clarity-mask="true"
      >
        <DialogTitle className={cn(gate.loading && 'sr-only')}>
          ChequeCheck
        </DialogTitle>
        <DialogDescription className={cn(gate.loading && 'sr-only')}>
          {t('locked')}
        </DialogDescription>
        {gate.loading ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="pin-gate-checking"
            className="flex flex-col items-center gap-4 py-8 text-center"
          >
            <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Spinner className="size-7" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {t('checking')}
              </p>
              <p className="text-sm text-muted-foreground">
                {checkingHints[hintIndex]}
              </p>
            </div>
          </div>
        ) : (
          <>
            <h2>{t('locked')}</h2>
            {recover ? (
              <>
                <PinSettings
                  recovery
                  onDone={() => {
                    setRecover(false)
                    void gate.refresh()
                  }}
                />
                <Button variant="outline" onClick={() => setRecover(false)}>
                  {t('back')}
                </Button>
              </>
            ) : (
              <>
                {gate.status?.enabled && !gate.status.blocked && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void gate.verify(pin).then(() => setPin(''))
                    }}
                  >
                    <Label htmlFor="unlock-pin">{t('enterPin')}</Label>
                    <Input
                      id="unlock-pin"
                      autoFocus
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      disabled={gate.busy}
                      required
                    />
                    <Button type="submit" disabled={gate.busy}>
                      {t('unlock')}
                    </Button>
                  </form>
                )}
                {gate.remaining !== null && (
                  <p role="status">
                    {t('attempts', { count: gate.remaining })}
                  </p>
                )}
                {gate.error && (
                  <p role="alert">
                    {t.has(gate.error) ? t(gate.error) : t('unavailable')}
                  </p>
                )}
                {gate.status?.blocked && <p role="alert">{t('blocked')}</p>}
                <Button
                  variant="outline"
                  disabled={gate.busy}
                  onClick={() => void gate.refresh()}
                >
                  {t('retry')}
                </Button>
                <Button
                  variant="outline"
                  disabled={gate.busy}
                  onClick={() => {
                    setPin('')
                    setRecover(true)
                  }}
                >
                  {t('forgotPin')}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              disabled={gate.busy}
              onClick={() => void gate.signOut()}
            >
              {t('signOut')}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
