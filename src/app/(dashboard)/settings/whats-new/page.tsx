'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ZapIcon as Zap,
  LabelIcon as Tag,
  CheckmarkBadge01Icon as Premium,
  Shield01Icon as Shield,
} from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import { APP_VERSION } from '@/lib/app-version'

export default function WhatsNewPage() {
  const t = useTranslations('Settings')
  const display = useDisplayFormat()
  const updatedDate = display.date('2026-10-31')
  const features = [
    { key: 'releasePhone', icon: Shield, image: undefined },
    { key: 'releaseBanks', icon: Shield, image: undefined },
    { key: 'releaseTags', icon: Tag, image: undefined },
    { key: 'releaseDrafts', icon: Zap, image: undefined },
    { key: 'releaseReports', icon: Zap, image: undefined },
    { key: 'releasePremium', icon: Premium, image: undefined },
    { key: 'releaseReminders', icon: Zap, image: undefined },
    { key: 'releaseReliability', icon: Shield, image: undefined },
  ] as const

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="space-y-12 px-2">
        <div className="relative space-y-6 pl-8">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-4 border-background bg-primary" />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              {t('whatsNew')}
            </p>
            <h2 className="text-xl font-semibold">
              {t('releaseTitle')} -{' '}
              <span className="text-muted-foreground">v{APP_VERSION}</span>
            </h2>
          </div>

          <div className="grid gap-4">
            {features.map((feature) => (
              <article
                key={feature.key}
                className="overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition-colors hover:bg-muted/30"
              >
                {feature.image ? (
                  <SkeletonImage
                    src={feature.image}
                    alt=""
                    width={640}
                    height={240}
                    className="h-36 w-full object-cover"
                    containerClassName="h-36 w-full"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-muted text-primary">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-background/80 shadow-sm">
                      <HugeiconsIcon
                        icon={feature.icon}
                        className="size-7"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2 p-4">
                  <h3 className="font-medium">{t(`${feature.key}Title`)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`${feature.key}Desc`)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        {t('lastUpdated', { date: updatedDate })}
      </p>
    </div>
  )
}
