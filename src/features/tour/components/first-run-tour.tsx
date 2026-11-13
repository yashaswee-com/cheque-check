'use client'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import { logger } from '@/lib/logger'
const steps = [
  { key: 'summary', target: 'summary' },
  { key: 'add', target: 'add' },
  { key: 'scan', target: 'scan' },
  { key: 'reports', target: 'reports' },
  { key: 'settings', target: 'settings' },
  { key: 'voice', target: 'settings' },
] as const
type Box = {
  target: string
  left: number
  top: number
  width: number
  height: number
}
function TourDialog({
  onFinish,
}: {
  onFinish: (status: 'completed' | 'skipped') => Promise<void>
}) {
  const t = useTranslations('Tour')
  const router = useRouter()
  const [step, setStep] = useState(0),
    [box, setBox] = useState<Box | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  const reduced = useReducedMotionPreference()
  const saving = useRef(false)
  const { key, target } = steps[step]
  const activeBox = box?.target === target ? box : null
  // The card sits on the opposite half so it never covers the spotlight.
  const placement =
    activeBox && activeBox.top + activeBox.height / 2 < window.innerHeight / 2
      ? 'bottom'
      : 'top'
  useEffect(() => {
    let element: HTMLElement | null = null
    let frame = 0
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => refresh())
    const measure = () => {
      const next = document.querySelector<HTMLElement>(
        `[data-tour="${target}"]`,
      )
      if (next !== element) {
        resizeObserver?.disconnect()
        element = next
        if (element) resizeObserver?.observe(element)
        element?.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: reduced ? 'instant' : 'smooth',
        })
      }
      if (!element) {
        setBox(null)
        return
      }
      const rect = element.getBoundingClientRect()
      const nextBox =
        rect.width > 0 && rect.height > 0
          ? {
              target,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }
          : null
      setBox((previous) =>
        previous?.target === nextBox?.target &&
        previous?.left === nextBox?.left &&
        previous?.top === nextBox?.top &&
        previous?.width === nextBox?.width &&
        previous?.height === nextBox?.height
          ? previous
          : nextBox,
      )
    }
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    refresh()
    return () => {
      observer.disconnect()
      resizeObserver?.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [target, reduced])
  const finish = async (status: 'completed' | 'skipped') => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(false)
    try {
      await onFinish(status)
      if (status === 'completed') {
        router.push('/features/catalog#voice-reminders')
      }
    } catch (error) {
      logger.error('Tour completion could not be saved', error)
      setError(true)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void finish('skipped')
      }}
      disablePointerDismissal
    >
      {activeBox &&
        createPortal(
          <div
            aria-hidden="true"
            data-testid="tour-spotlight"
            className="tour-spotlight-ring pointer-events-none fixed z-[60] rounded-lg border-2 border-white"
            style={{
              left: activeBox.left - 4,
              top: activeBox.top - 4,
              width: activeBox.width + 8,
              height: activeBox.height + 8,
              boxShadow: '0 0 0 100vmax rgba(0,0,0,0.6)',
            }}
          />,
          document.body,
        )}
      <DialogContent
        scrollable
        showCloseButton={false}
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        className="z-[70] max-h-[45dvh]"
        data-testid="tour-card"
        data-placement={placement}
        style={
          placement === 'bottom'
            ? {
                top: 'auto',
                bottom: 'calc(1rem + env(safe-area-inset-bottom))',
                translate: '-50% 0',
              }
            : {
                top: 'calc(1rem + env(safe-area-inset-top))',
                translate: '-50% 0',
              }
        }
      >
        <p className="text-xs" aria-live="polite">
          {t('progress', { step: step + 1, total: steps.length })}
        </p>
        <DialogTitle>{t(`${key}.title`)}</DialogTitle>
        <DialogDescription>{t(`${key}.body`)}</DialogDescription>
        {!activeBox && <p role="status">{t('waiting')}</p>}
        {error && <p role="alert">{t('saveError')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            className="font-normal"
            variant="outline"
            disabled={busy}
            onClick={() => void finish('skipped')}
          >
            {t('skip')}
          </Button>
          <Button
            variant="outline"
            disabled={busy || step === 0}
            onClick={() => setStep(step - 1)}
          >
            {t('back')}
          </Button>
          <Button
            className="font-normal"
            disabled={busy || !activeBox}
            onClick={() =>
              step === steps.length - 1
                ? void finish('completed')
                : setStep(step + 1)
            }
          >
            {step === steps.length - 1 ? t('voiceAction') : t('next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export function FirstRunTour() {
  const { profile, updateProfile } = useProfile()
  return profile?.tour_status === 'pending' ? (
    <TourDialog
      key={profile.user_id}
      onFinish={(status) => updateProfile({ tour_status: status })}
    />
  ) : null
}
