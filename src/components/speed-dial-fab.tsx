'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  PencilEdit01Icon as Pencil,
  MoreVerticalIcon as More,
  Cancel01Icon as Close,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PremiumMark } from '@/features/monetization/components/premium-mark'
import type { PremiumFeature } from '@/features/monetization/lib/premium-access'

export interface SpeedDialAction {
  label: string
  icon: IconSvgElement
  onClick: () => unknown
  destructive?: boolean
  disabled?: boolean
  loading?: boolean
  testId?: string
  premiumFeature?: PremiumFeature
}

interface SpeedDialFabProps {
  editHref: string
  editLabel: string
  actions?: SpeedDialAction[]
  children?: React.ReactNode
}

/** View-page FAB: primary edit button plus an optional menu of secondary actions. */
export function SpeedDialFab({
  editHref,
  editLabel,
  actions = [],
  children,
}: SpeedDialFabProps) {
  const t = useTranslations('Common')
  const tp = useTranslations('Premium')
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const isPendingRef = useRef(false)
  const isLoading = isPending || actions.some((action) => action.loading)

  const runAction = (action: SpeedDialAction) => {
    if (isLoading || isPendingRef.current) return
    setOpen(false)
    const result = action.onClick()
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      'then' in result &&
      typeof result.then === 'function'
    ) {
      isPendingRef.current = true
      setIsPending(true)
      return Promise.resolve(result).finally(() => {
        isPendingRef.current = false
        setIsPending(false)
      })
    }
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed bottom-[calc(5rem+var(--shell-bottom-extra,0px)+env(safe-area-inset-bottom))] right-6 z-40 flex w-16 flex-col items-center gap-3">
        {open && (
          <ul
            role="menu"
            aria-label={t('moreActions')}
            className="flex w-full flex-col items-end gap-2"
          >
            {children && <li role="none">{children}</li>}
            {actions.map((action, index) => (
              <li
                key={action.label}
                role="none"
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-200"
                style={{
                  animationDelay: `${(actions.length - 1 - index) * 35}ms`,
                }}
              >
                <Button
                  variant="ghost"
                  type="button"
                  role="menuitem"
                  disabled={action.disabled || isLoading}
                  loading={action.loading}
                  data-testid={action.testId}
                  data-premium-feature={action.premiumFeature}
                  title={action.premiumFeature ? tp('marker') : undefined}
                  onClick={() => runAction(action)}
                  className={cn(
                    'flex h-auto items-center gap-3 rounded-full border-0 bg-background py-1.5 pl-4 pr-1.5 text-sm font-normal shadow-lg ring-1 ring-border transition-transform hover:bg-background active:scale-95 disabled:opacity-50',
                    action.destructive && 'text-destructive',
                  )}
                >
                  {action.label}
                  {action.premiumFeature && <PremiumMark />}
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary',
                      action.destructive &&
                        'bg-destructive/10 text-destructive',
                    )}
                  >
                    <HugeiconsIcon icon={action.icon} className="size-4" />
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(actions.length > 0 || children) && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            loading={isLoading}
            aria-label={open ? t('close') : t('moreActions')}
            aria-expanded={open}
            data-testid="speed-dial-toggle"
            onClick={() => setOpen((value) => !value)}
            className="h-12 w-12 self-center rounded-full shadow-lg ring-1 ring-border"
          >
            <HugeiconsIcon icon={open ? Close : More} className="h-5 w-5" />
          </Button>
        )}

        <Link
          href={editHref}
          aria-label={editLabel}
          data-testid="speed-dial-edit-link"
        >
          <Button
            size="icon"
            tabIndex={-1}
            className="h-16 w-16 rounded-full border-4 border-white shadow-xl dark:border-zinc-900"
          >
            <HugeiconsIcon icon={Pencil} className="h-7 w-7" />
          </Button>
        </Link>
      </div>
    </>
  )
}
