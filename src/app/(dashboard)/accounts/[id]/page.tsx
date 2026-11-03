'use client'

import { useAccountDetail } from '@/features/accounts/hooks/use-account-detail'
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
  Tick02Icon as Check,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'

import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { useRedirectIfDraft } from '@/features/drafts'

import { SpeedDialFab } from '@/components/speed-dial-fab'
import { EntityTagsSection } from '@/features/tags/components/tag-chips'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'

export default function AccountDetailPage() {
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const display = useDisplayFormat(profile)
  const businessId = activeBusiness?.id

  const { account, accountCheques, isLoading } = useAccountDetail(
    id,
    businessId,
  )

  const isDraft = useRedirectIfDraft('account', account)

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

  if (!account)
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
              name={account.bank?.name || tc('bank')}
              color={account.color}
              icon={account.icon}
              imageUrl={account.logo_url ?? account.bank?.logo_url}
              size="lg"
            />
            <div className="flex flex-col min-w-0">
              <TextTruncate
                text={account.account_name}
                maxLength={40}
                className="text-2xl font-semibold block"
              />
              <TextTruncate
                text={account.bank?.name || ''}
                maxLength={40}
                className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block"
              />
              {account.is_default && (
                <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <HugeiconsIcon icon={Check} className="size-3" />
                  {t('defaultAccount')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('accountNumber')}
            </p>
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Hash} className="h-3 w-3 text-primary" />
              <p className="font-mono font-semibold">
                {account.account_number}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('ifscCode')}
            </p>
            <p
              className="font-mono font-semibold uppercase"
              data-testid="account-detail-ifsc"
            >
              {account.ifsc_code || tc('notAvailable')}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-primary/5 relative z-10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('openingBalance')}
          </p>
          <p
            className="text-lg font-semibold"
            data-testid="account-detail-opening-balance"
          >
            {profile?.currency || '₹'}
            {display.number(account.opening_balance, {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>

        {account.notes && (
          <div className="pt-4 border-t border-primary/5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <HugeiconsIcon
                icon={Note}
                className="h-3 w-3 text-muted-foreground opacity-80"
              />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {tc('notes')}
              </p>
            </div>
            <p className="text-sm font-semibold italic text-muted-foreground">
              {account.notes}
            </p>
          </div>
        )}

        <div className="relative z-10">
          <EntityTagsSection entityType="account" entityId={account.id} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <HugeiconsIcon
            icon={FileText}
            className="h-3 w-3 text-muted-foreground opacity-80"
          />
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {tc('chequeHistory')}
          </h3>
        </div>

        <ScopedChequeList
          businessId={businessId}
          scope={{ account_id: id }}
          totalCount={accountCheques.length}
          emptyState={
            <EmptyState
              icon={ReceiptText}
              title={tc('noData')}
              description={t('noChequesDesc')}
              action={{
                label: tc('recordNewCheque'),
                href: '/cheques/create',
              }}
            />
          }
        />
      </div>

      <NativeTools destination="account" accountId={account.id} />

      <SpeedDialFab
        editHref={`/accounts/${id}/edit`}
        editLabel={t('editAccount')}
      />
    </div>
  )
}
