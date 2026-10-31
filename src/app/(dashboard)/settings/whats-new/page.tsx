import { HugeiconsIcon } from '@hugeicons/react'
import {
  ZapIcon as Zap,
  StarIcon as Star,
  Shield01Icon as Shield,
} from '@hugeicons/core-free-icons'
import { useFormatter, useTranslations } from 'next-intl'
import { APP_VERSION } from '@/lib/app-version'

export default function WhatsNewPage() {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const updatedDate = format.dateTime(new Date('2026-10-31T00:00:00Z'), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const features = [
    { key: 'releasePhone', icon: Shield },
    { key: 'releaseBanks', icon: Shield },
    { key: 'releaseTags', icon: Star },
    { key: 'releaseDrafts', icon: Zap },
    { key: 'releaseReports', icon: Zap },
    { key: 'releasePremium', icon: Star },
    { key: 'releaseReminders', icon: Zap },
    { key: 'releaseReliability', icon: Shield },
  ] as const

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="space-y-12 px-2">
        <div className="relative pl-8 space-y-6">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-4 border-background bg-primary" />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">
              {t('lastUpdated', { date: updatedDate })}
            </p>
            <h2 className="text-xl font-bold">
              {t('releaseTitle')} -{' '}
              <span className="text-muted-foreground">v{APP_VERSION}</span>
            </h2>
          </div>

          <div className="grid gap-4">
            {features.map((feature) => (
              <div
                key={feature.key}
                className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <HugeiconsIcon icon={feature.icon} className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold">{t(`${feature.key}Title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`${feature.key}Desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
