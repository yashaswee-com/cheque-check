'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFreeUsage } from '../hooks/use-free-usage'
import { Button } from '@/components/ui/button'
import { InfoPopover } from '@/components/ui/info-popover'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Invoice01Icon,
  Camera01Icon,
  Mic01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface UsageCardProps {
  /** Keep the card for unlimited plans; cheques then read as unlimited. */
  alwaysShow?: boolean
}

/** Plan, subscription and top-up allowances share `user_quotas` limits. */
export function UsageCard({ alwaysShow = false }: UsageCardProps) {
  const t = useTranslations('FreeUsage')
  const query = useFreeUsage()
  if (query.error)
    return (
      <aside className="rounded-xl border p-4">
        <p role="alert">{t('error')}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </aside>
    )
  if (!query.data) return <p role="status">{t('loading')}</p>
  if (query.data.unlimited && !alwaysShow) return null
  const data = query.data
  const title = alwaysShow ? t('usageTitle') : t('title')
  const counters = [
    {
      label: t('cheques'),
      used: data.cheques_used,
      limit: data.cheques_limit,
      icon: Invoice01Icon,
      unlimited: data.unlimited,
    },
    {
      label: t('scans'),
      used: data.ai_scans_used,
      limit: data.ai_scans_limit,
      icon: Camera01Icon,
      unlimited: false,
    },
    {
      label: t('voice'),
      used: data.voice_used,
      limit: data.voice_limit,
      icon: Mic01Icon,
      unlimited: false,
    },
  ]
  return (
    <aside
      className="space-y-4 rounded-2xl border border-primary/10 bg-card p-4 shadow-sm"
      aria-label={title}
      data-testid={alwaysShow ? 'usage-card' : 'free-usage-banner'}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <InfoPopover title={title}>{t('help')}</InfoPopover>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {counters.map((counter) => {
          const exhausted = !counter.unlimited && counter.used >= counter.limit
          const warning =
            !counter.unlimited && counter.used * 5 >= counter.limit * 4
          const usedText = counter.unlimited
            ? t('unlimited')
            : t('used', { used: counter.used, limit: counter.limit })
          const percent = counter.unlimited
            ? 0
            : counter.limit === 0
              ? 100
              : Math.min(100, Math.max(0, (counter.used / counter.limit) * 100))
          const state = exhausted ? 'exhausted' : warning ? 'warning' : 'normal'
          return (
            <div
              key={counter.label}
              data-state={state}
              className="min-w-0 rounded-xl bg-muted/50 px-2 py-3 text-center"
            >
              <div
                role="progressbar"
                aria-label={counter.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={usedText}
                className={cn(
                  'relative mx-auto mb-2 size-14',
                  exhausted
                    ? 'text-red-600 dark:text-red-400'
                    : warning
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-green-600 dark:text-green-400',
                )}
              >
                <svg
                  viewBox="0 0 56 56"
                  className="size-full -rotate-90"
                  aria-hidden="true"
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-15"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - percent}
                    strokeLinecap="round"
                  />
                </svg>
                <HugeiconsIcon
                  icon={counter.icon}
                  aria-hidden="true"
                  className="absolute inset-0 m-auto size-5"
                />
              </div>
              <p className="text-xs font-semibold">{counter.label}</p>
              <p className="mt-1 text-xs tabular-nums">{usedText}</p>
              {state !== 'normal' && (
                <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                  {t(state === 'exhausted' ? 'exhausted' : 'warning')}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <Link
        className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
        href="/features/catalog"
      >
        {t('upgrade')}
      </Link>
    </aside>
  )
}
