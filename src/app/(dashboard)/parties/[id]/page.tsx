'use client'

import { usePartyDetail } from '@/features/parties/hooks/use-party-detail'
import { ScopedChequeList } from '@/features/cheques/components/scoped-cheque-list'
import { useParams } from 'next/navigation'
import {
  UserIcon as User,
  Mail01Icon as Mail,
  LockPasswordIcon as Lock,
  CallIcon as Phone,
  Calendar03Icon as Calendar,
  HashtagIcon as Hash,
  Note01Icon as Note,
  Building03Icon as Building,
  Wallet01Icon as Wallet,
  Location01Icon as Location,
  TextFontIcon as TextIcon,
  PencilEdit01Icon as Pencil,
  File02Icon as FileText,
  Invoice01Icon as ReceiptText,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'

import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import { useTranslations } from 'next-intl'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'
import { useRedirectIfDraft } from '@/features/drafts'
import { SpeedDialFab } from '@/components/speed-dial-fab'
import { EntityTagsSection } from '@/features/tags/components/tag-chips'

export default function PartyDetailPage() {
  const t = useTranslations('Parties')
  const tCommon = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const businessId = activeBusiness?.id
  const currency = profile?.currency || '₹'
  const display = useDisplayFormat(profile)

  const { party, partyCheques, outstanding, isLoading } = usePartyDetail(
    id,
    businessId,
  )

  const isDraft = useRedirectIfDraft('party', party)

  if (isLoading || isDraft) {
    return (
      <div className="max-w-2xl space-y-8 pb-20">
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!party)
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
              name={party.name}
              color={party.color}
              icon={party.icon}
              imageUrl={party.avatar_url}
              size="lg"
            />
            <div className="flex flex-col min-w-0">
              <TextTruncate
                text={party.name}
                maxLength={40}
                className="text-2xl font-semibold block"
              />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                {party.contact}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="rounded-sm bg-primary/5 p-4 border border-primary/10">
            <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
              {tCommon('outstanding')}
            </p>
            <p
              className="mt-2 text-2xl font-semibold"
              data-testid="party-detail-outstanding"
            >
              {currency}
              {display.number(outstanding)}
            </p>
          </div>
          <div className="rounded-sm bg-canvas-parchment p-4 border border-border/50">
            <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
              {tCommon('totalCheques')}
            </p>
            <p
              className="mt-2 text-2xl font-semibold"
              data-testid="party-detail-total-cheques"
            >
              {partyCheques.length}
            </p>
          </div>
        </div>

        {party.address && (
          <div className="pt-2 relative z-10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tCommon('address')}
            </p>
            <p className="text-sm font-semibold">{party.address}</p>
          </div>
        )}

        <div className="relative z-10">
          <EntityTagsSection entityType="party" entityId={party.id} />
        </div>
      </div>

      <NativeTools
        destination="party"
        businessId={businessId}
        businessName={activeBusiness?.name}
        partyId={id}
      />

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <HugeiconsIcon
            icon={FileText}
            className="h-3 w-3 text-muted-foreground opacity-80"
          />
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {tCommon('chequeHistory')}
          </h3>
        </div>

        <ScopedChequeList
          businessId={businessId}
          scope={{ party_id: id }}
          totalCount={partyCheques.length}
          emptyState={
            <EmptyState
              icon={ReceiptText}
              title={t('noChequesTitle')}
              description={t('noChequesDesc')}
              action={{
                label: t('recordNewCheque'),
                href: '/cheques/create',
              }}
            />
          }
        />
      </div>

      <SpeedDialFab
        editHref={`/parties/${id}/edit`}
        editLabel={t('editParty')}
        actions={[
          {
            label: tCommon('contact'),
            icon: Phone,
            onClick: () => window.open(`tel:${party.contact}`, '_self'),
          },
          ...(party.email
            ? [
                {
                  label: tCommon('email'),
                  icon: Mail,
                  onClick: () => window.open(`mailto:${party.email}`, '_self'),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
