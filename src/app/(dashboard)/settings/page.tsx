'use client'

import { useProfile } from '@/features/profile/hooks/use-profile'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon as ChevronRight,
  ChartHistogramIcon as FileSpreadsheet,
  Building03Icon as Building2,
  LayoutGridIcon as LayoutGrid,
  Settings02Icon as Settings2,
  Notification01Icon as Notifications,
  MegaphoneIcon as Megaphone,
  News01Icon as News,
  ChatFeedbackIcon as FeedbackIcon,
  CustomerSupportIcon as CustomerSupport,
  HelpCircleIcon as Help,
  InformationCircleIcon as Info,
  Shield01Icon as Shield,
  Shield02Icon as PrivacyShield,
  UserLock02Icon as SecurityLock,
  LicenseIcon as License,
  Invoice03Icon as Money,
  SparklesIcon as Features,
  GiftIcon as Gift,
  LabelIcon as Tag,
  ReceiptIndianRupeeIcon as Refund,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { useTranslations } from 'next-intl'
import { IconType } from '@/types'
import { useMonetization } from '@/features/monetization/hooks/use-monetization'
import { PremiumLink } from '@/features/monetization/components/premium-controls'
import { PremiumMark } from '@/features/monetization/components/premium-mark'
import type { PremiumFeature } from '@/features/monetization/lib/premium-access'
import { version } from '../../../../package.json'
import { useFreeUsage } from '@/features/monetization/hooks/use-free-usage'
import { UsageMeter } from '@/components/ui/usage-meter'
import { InfoPopover } from '@/components/ui/info-popover'
import { usePremiumAvatarRing } from '@/features/monetization/hooks/use-premium-avatar-ring'
import { PwaInstallCard } from '@/components/pwa-install-card'
import {
  Invoice01Icon,
  Camera01Icon,
  Mic01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface SettingsItem {
  name: string
  description?: string
  icon: IconType
  href: string
  action?: () => void
  premiumFeature?: PremiumFeature
}

interface SettingsSection {
  title: string
  icon: IconType
  items: SettingsItem[]
}

function memberDuration(createdAt: string, now: Date): string | null {
  const created = new Date(createdAt)
  if (!Number.isFinite(created.getTime()) || created > now) return null

  let totalMonths =
    (now.getUTCFullYear() - created.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    created.getUTCMonth()
  if (now.getUTCDate() < created.getUTCDate()) totalMonths -= 1
  if (totalMonths < 0) return null
  if (totalMonths === 0) return '<1m'

  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  return [years > 0 ? `${years}y` : '', months > 0 ? `${months}m` : '']
    .filter(Boolean)
    .join(' ')
}

export default function SettingsPage() {
  const t = useTranslations('Settings')
  const feedback = useTranslations('Feedback')
  const referrals = useTranslations('Referrals')
  const freeUsage = useTranslations('FreeUsage')
  const tpa = useTranslations('PhoneAuth')
  const security = useTranslations('Security')
  const { profile, isLoading: profileLoading } = useProfile()
  const premiumRing = usePremiumAvatarRing()
  const display = useDisplayFormat(profile)
  const usageQuery = useFreeUsage()
  const { isLoading: monetizationLoading } = useMonetization()
  const membershipDuration = profile?.created_at
    ? memberDuration(profile.created_at, new Date())
    : null

  if (profileLoading || monetizationLoading) {
    return (
      <div className="max-w-2xl space-y-8 pb-20">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const sections: SettingsSection[] = [
    {
      title: t('general'),
      icon: LayoutGrid,
      items: [
        {
          name: t('preferences'),
          description: t('preferencesDesc'),
          icon: Settings2,
          href: '/settings/preferences',
        },
        {
          name: security('pinTitle'),
          icon: SecurityLock,
          href: '/settings/security',
        },
        {
          name: t('notifications'),
          description: t('notificationsDesc'),
          icon: Notifications,
          href: '/settings/notifications',
        },
        {
          name: t('transactions'),
          description: t('transactionsDesc'),
          icon: Money,
          href: '/settings/transactions',
        },
        {
          name: t('features'),
          description: t('featuresDesc'),
          icon: Features,
          href: '/features/catalog',
        },
        { name: referrals('title'), icon: Gift, href: '/referrals' },
      ],
    },
    {
      title: t('management'),
      icon: Building2,
      items: [
        {
          name: t('businesses'),
          description: t('businessesDesc'),
          icon: Building2,
          href: '/businesses',
        },
        {
          name: t('reports'),
          description: t('reportsDesc'),
          icon: FileSpreadsheet,
          href: '/reports',
          premiumFeature: 'reports',
        },
        {
          name: t('manageTags'),
          description: t('manageTagsDescShort'),
          icon: Tag,
          href: '/tags',
        },
      ],
    },
    {
      title: t('support'),
      icon: Help,
      items: [
        {
          name: t('whatsNew'),
          description: t('whatsNewDesc'),
          icon: News,
          href: '/settings/whats-new',
        },
        {
          name: 'Announcements',
          description: 'Latest product updates and important changes.',
          icon: Megaphone,
          href: '/announcements',
        },
        {
          name: feedback('submitTitle'),
          description: t('feedbackDesc'),
          icon: FeedbackIcon,
          href: '/feedback',
        },
        {
          name: t('helpAndSupport'),
          description: t('helpAndSupportDesc'),
          icon: CustomerSupport,
          href: '/help',
        },
        {
          name: t('aboutApp'),
          description: t('aboutAppDesc'),
          icon: Info,
          href: '/settings/about',
        },
      ],
    },
    {
      title: t('legal'),
      icon: PrivacyShield,
      items: [
        {
          name: t('privacyPolicy'),
          description: t('privacyPolicyDesc'),
          icon: Shield,
          href: '/settings/privacy-policy',
        },
        {
          name: t('termsAndConditions'),
          description: t('termsAndConditionsDesc'),
          icon: License,
          href: '/settings/terms-and-conditions',
        },
        {
          name: t('refundPolicy'),
          description: t('refundPolicyDesc'),
          icon: Refund,
          href: '/settings/refund-policy',
        },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="space-y-4 sm:space-y-5">
        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-lg bg-canvas-parchment p-5 transition-colors hover:bg-muted/40 active:bg-muted/50 dark:bg-surface-tile-1"
        >
          <EntityAvatar
            name={profile?.name || t('user')}
            imageUrl={profile?.avatar_url}
            size="lg"
            className={cn('h-14 w-14', premiumRing)}
          />
          <div className="flex-1">
            <p className="font-semibold text-lg leading-tight">
              {profile?.name || t('user')}
            </p>
            <p className="text-xs text-muted-foreground font-semibold">
              {profile?.email ?? tpa('noEmail')}
            </p>
            {membershipDuration && (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('memberFor', { duration: membershipDuration })}
              </p>
            )}
          </div>
          <HugeiconsIcon
            icon={ChevronRight}
            className="h-4 w-4 text-muted-foreground opacity-30"
          />
        </Link>

        <PwaInstallCard variant="inline" />
        {usageQuery.error ? (
          <aside
            className="space-y-3 rounded-xl border p-4"
            data-testid="usage-card"
          >
            <p role="alert">{freeUsage('error')}</p>
            <Button variant="outline" onClick={() => void usageQuery.refetch()}>
              {freeUsage('retry')}
            </Button>
          </aside>
        ) : !usageQuery.data ? (
          <p role="status" data-testid="usage-card">
            {freeUsage('loading')}
          </p>
        ) : (
          <aside
            className="space-y-4 rounded-2xl border border-primary/10 bg-card p-4 shadow-sm"
            aria-label={freeUsage('usageTitle')}
            data-testid="usage-card"
            data-always-show="true"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-normal">
                <HugeiconsIcon
                  icon={Invoice01Icon}
                  className="size-5 text-primary"
                />
                {freeUsage('usageTitle')}
              </h2>
              <InfoPopover title={freeUsage('usageTitle')}>
                {freeUsage('help')}
              </InfoPopover>
            </div>
            <div className="space-y-4">
              {[
                {
                  label: freeUsage('cheques'),
                  used: usageQuery.data.cheques_used,
                  limit: usageQuery.data.cheques_limit,
                  icon: Invoice01Icon,
                  unlimited: usageQuery.data.unlimited,
                },
                {
                  label: freeUsage('scans'),
                  used: usageQuery.data.ai_scans_used,
                  limit: usageQuery.data.ai_scans_limit,
                  icon: Camera01Icon,
                  unlimited: false,
                },
                {
                  label: freeUsage('voice'),
                  used: usageQuery.data.voice_used,
                  limit: usageQuery.data.voice_limit,
                  icon: Mic01Icon,
                  unlimited: false,
                },
              ].map((row) => (
                <UsageMeter
                  key={row.label}
                  label={row.label}
                  used={row.used}
                  limit={row.limit}
                  unlimited={row.unlimited}
                  icon={row.icon}
                  usedText={
                    row.unlimited
                      ? freeUsage('unlimited')
                      : freeUsage('used', { used: row.used, limit: row.limit })
                  }
                />
              ))}
            </div>
          </aside>
        )}
      </div>

      <div className="space-y-8">
        {sections.map((section: SettingsSection) => (
          <div key={section.title} className="space-y-3">
            <div className="flex items-center gap-2 px-2">
              <div className="flex h-5 w-5 items-center justify-center text-primary">
                <HugeiconsIcon icon={section.icon} className="h-3 w-3" />
              </div>
              <h3 className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                {section.title}
              </h3>
            </div>
            <div className="divide-y divide-border/50 rounded-lg border bg-card overflow-hidden">
              {section.items.map((item: SettingsItem) => {
                const content = (
                  <div
                    key={item.name}
                    className={cn(
                      'flex items-center justify-between p-4 transition-colors',
                      (item.action || item.href) &&
                        'cursor-pointer active:bg-muted/50 hover:bg-muted/30',
                    )}
                    onClick={item.action}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-primary">
                        <HugeiconsIcon
                          icon={item.icon}
                          className="h-5 w-5"
                          data-settings-item-icon
                        />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm">{item.name}</span>
                        {item.description && (
                          <span className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={ChevronRight}
                        className="h-4 w-4 text-muted-foreground opacity-30"
                      />
                    </div>
                  </div>
                )

                return item.premiumFeature ? (
                  <PremiumLink
                    href={item.href}
                    feature={item.premiumFeature}
                    key={item.name}
                    className="relative block *:data-[slot=premium-mark]:absolute *:data-[slot=premium-mark]:right-10 *:data-[slot=premium-mark]:top-1/2 *:data-[slot=premium-mark]:-translate-y-1/2"
                  >
                    {content}
                  </PremiumLink>
                ) : (
                  <Link href={item.href} key={item.name} className="block">
                    {content}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center pb-8">
        <p className="text-xs text-muted-foreground font-semibold opacity-50 uppercase tracking-wider">
          ChequeCheck v{version}
        </p>
        <p className="text-[10px] text-muted-foreground mt-2 opacity-30 font-semibold">
          {display.dateTime(new Date())}
        </p>
      </div>
    </div>
  )
}
