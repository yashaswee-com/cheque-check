'use client'

import { useProfile } from '@/features/profile/hooks/use-profile'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon as ChevronRight,
  Logout01Icon as LogOut,
  File01Icon as FileSpreadsheet,
  Building03Icon as Building2,
  LayoutGridIcon as LayoutGrid,
  FlashIcon as Zap,
  Settings02Icon as Settings2,
  MegaphoneIcon as Megaphone,
  HelpCircleIcon as Help,
  InformationCircleIcon as Info,
  Shield01Icon as Shield,
  LicenseIcon as License,
  Money03Icon as Money,
  CrownIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { useTranslations } from 'next-intl'
import { IconType } from '@/types'
import { useMonetization } from '@/features/monetization/hooks/use-monetization'
import { PremiumLink } from '@/features/monetization/components/premium-controls'
import { PremiumMark } from '@/features/monetization/components/premium-mark'
import type { PremiumFeature } from '@/features/monetization/lib/premium-access'
import { version } from '../../../../package.json'
import { ReplayTour } from '@/features/tour/components/replay-tour'
import { UsageCard } from '@/features/monetization/components/free-usage-banner'
import { usePremiumAvatarRing } from '@/features/monetization/hooks/use-premium-avatar-ring'

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
  const referrals = useTranslations('Referrals')
  const feedback = useTranslations('Feedback')
  const tp = useTranslations('Premium')
  const tpa = useTranslations('PhoneAuth')
  const security = useTranslations('Security')
  const { profile, isLoading: profileLoading } = useProfile()
  const premiumRing = usePremiumAvatarRing()
  const display = useDisplayFormat(profile)
  const { handleLogout } = useSettings()
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
          name: tp('openTools'),
          description: tp('benefitsTitle'),
          icon: Zap,
          href: '/cheques#bulk-import',
          premiumFeature: 'bulk-import',
        },
        {
          name: t('preferences'),
          description: t('preferencesDesc'),
          icon: Settings2,
          href: '/settings/preferences',
        },
        {
          name: security('pinTitle'),
          icon: Shield,
          href: '/settings/security',
        },
        {
          name: t('notifications'),
          description: t('notificationsDesc'),
          icon: Settings2,
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
          icon: CrownIcon,
          href: '/features/catalog',
        },
        { name: referrals('title'), icon: CrownIcon, href: '/referrals' },
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
          icon: Settings2,
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
          icon: Megaphone,
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
          description: feedback('privacyNote'),
          icon: Help,
          href: '/feedback',
        },
        {
          name: t('helpAndSupport'),
          description: t('helpAndSupportDesc'),
          icon: Help,
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
      icon: Shield,
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
          icon: Money,
          href: '/settings/refund-policy',
        },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      {/* Profile Section */}
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

      <UsageCard alwaysShow />

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
                        {item.icon === CrownIcon ? (
                          <PremiumMark />
                        ) : (
                          <HugeiconsIcon icon={item.icon} className="h-3 w-3" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold">
                          {item.name}
                        </span>
                        {item.description && (
                          <span className="mt-0.5 truncate text-[10px] font-medium leading-tight text-muted-foreground">
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
                  <Link href={item.href} key={item.name}>
                    {content}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <ReplayTour />
      <Button
        variant="destructive"
        data-testid="settings-logout-button"
        className="w-full rounded-full h-14 text-lg font-semibold"
        onClick={handleLogout}
      >
        <HugeiconsIcon icon={LogOut} className="mr-2 h-5 w-5" /> {t('signOut')}
      </Button>

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
