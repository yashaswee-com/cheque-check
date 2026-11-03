'use client'

import { useBusinessDetail } from '@/features/businesses/hooks/use-business-detail'
import { ScopedChequeList } from '@/features/cheques/components/scoped-cheque-list'
import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CallIcon as Phone,
  Mail01Icon as Mail,
  PencilEdit01Icon as Pencil,
  Location01Icon as MapPin,
  File02Icon as FileText,
  Invoice01Icon as ReceiptText,
} from '@hugeicons/core-free-icons'
import Link from 'next/link'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { SpeedDialFab } from '@/components/speed-dial-fab'
import { EntityTagsSection } from '@/features/tags/components/tag-chips'
import { TextTruncate } from '@/components/ui/text-truncate'
import { useTranslations } from 'next-intl'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'

export default function BusinessDetailPage() {
  const t = useTranslations('Businesses')
  const tc = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { profile } = useProfile()
  const currency = profile?.currency || '₹'
  const display = useDisplayFormat(profile)

  const { business, cheques, stats, isLoading } = useBusinessDetail(id)

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-8 pb-20">
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!business)
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t('notFound')}
      </div>
    )

  return (
    <div className="max-w-2xl space-y-8 pb-28">
      <div className="rounded-lg border bg-card p-6 space-y-6 relative overflow-hidden border-primary/5">
        <div className="flex justify-between items-start relative z-10">
          <div className="flex items-center gap-4">
            <EntityAvatar
              name={business.name}
              color={business.color}
              icon={business.icon}
              imageUrl={business.logo_url}
              size="lg"
            />
            <div className="flex flex-col min-w-0">
              <TextTruncate
                text={business.name}
                maxLength={40}
                className="text-2xl font-semibold block"
              />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                {business.phone || tc('noPhone')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="rounded-sm bg-primary/5 p-4 border border-primary/10">
            <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
              {tc('totalVolume')}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {currency}
              {display.number(stats.totalAmount)}
            </p>
          </div>
          <div className="rounded-sm bg-canvas-parchment p-4 border border-border/50">
            <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
              {tc('cheques')}
            </p>
            <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 relative z-10">
          <div className="rounded-sm bg-green-500/5 p-3 border border-green-500/10 text-center">
            <p className="text-[8px] font-bold text-green-600 uppercase tracking-tighter">
              {tc('cleared')}
            </p>
            <p className="mt-1 text-lg font-bold text-green-600">
              {stats.cleared}
            </p>
          </div>
          <div className="rounded-sm bg-orange-500/5 p-3 border border-orange-500/10 text-center">
            <p className="text-[8px] font-bold text-orange-600 uppercase tracking-tighter">
              {tc('pending')}
            </p>
            <p className="mt-1 text-lg font-bold text-orange-600">
              {stats.pending}
            </p>
          </div>
          <div className="rounded-sm bg-red-500/5 p-3 border border-red-500/10 text-center">
            <p className="text-[8px] font-bold text-red-600 uppercase tracking-tighter">
              {tc('bounced')}
            </p>
            <p className="mt-1 text-lg font-bold text-red-600">
              {stats.bounced}
            </p>
          </div>
        </div>

        {business.address && (
          <div className="pt-2 relative z-10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <HugeiconsIcon icon={MapPin} className="h-3 w-3" />{' '}
              {tc('address')}
            </p>
            <p className="text-sm font-semibold">{business.address}</p>
          </div>
        )}

        <div className="relative z-10">
          <EntityTagsSection entityType="business" entityId={business.id} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <HugeiconsIcon
            icon={FileText}
            className="h-3 w-3 text-muted-foreground opacity-80"
          />
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('businessCheques')}
          </h3>
        </div>

        <ScopedChequeList
          businessId={id}
          totalCount={cheques?.length ?? 0}
          emptyState={
            <EmptyState
              icon={ReceiptText}
              title={t('noChequesTitle')}
              description={t('noChequesDesc')}
            />
          }
        />
      </div>

      <NativeTools
        destination="business"
        businessId={business.id}
        businessName={business.name}
      />

      <SpeedDialFab
        editHref={`/businesses/${id}/edit`}
        editLabel={t('editBusiness')}
        actions={[
          ...(business.phone
            ? [
                {
                  label: tc('contact'),
                  icon: Phone,
                  onClick: () => window.open(`tel:${business.phone}`, '_self'),
                },
              ]
            : []),
          ...(business.email
            ? [
                {
                  label: tc('email'),
                  icon: Mail,
                  onClick: () =>
                    window.open(`mailto:${business.email}`, '_self'),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
