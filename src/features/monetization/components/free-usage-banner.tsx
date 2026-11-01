'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFreeUsage } from '../hooks/use-free-usage'
import { Button } from '@/components/ui/button'

export function FreeUsageBanner() {
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
  if (query.data.unlimited) return null
  const data = query.data
  const counters = [
    { label: t('cheques'), used: data.cheques_used, limit: data.cheques_limit },
    { label: t('scans'), used: data.ai_scans_used, limit: data.ai_scans_limit },
    { label: t('voice'), used: data.voice_used, limit: data.voice_limit },
  ]
  return (
    <aside className="space-y-3 rounded-xl border p-4" aria-label={t('title')}>
      <h2 className="font-semibold">{t('title')}</h2>
      {counters.map((counter) => {
        const exhausted = counter.used >= counter.limit
        const warning = counter.used * 5 >= counter.limit * 4
        return (
          <div
            key={counter.label}
            data-state={
              exhausted ? 'exhausted' : warning ? 'warning' : 'normal'
            }
          >
            <p
              className={
                warning
                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                  : ''
              }
            >
              {counter.label}:{' '}
              {t('used', { used: counter.used, limit: counter.limit })}
            </p>
            <p className="text-xs">
              {t('remaining', {
                count: Math.max(0, counter.limit - counter.used),
              })}
              {exhausted
                ? ` - ${t('exhausted')}`
                : warning
                  ? ` - ${t('warning')}`
                  : ''}
            </p>
          </div>
        )
      })}
      <Link className="underline text-sm" href="/features">
        {t('upgrade')}
      </Link>
    </aside>
  )
}
