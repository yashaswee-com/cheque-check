'use client'

import {
  useAccountDetail,
  type SortBy,
  type SortOrder,
} from '@/features/accounts/hooks/use-account-detail'
import { ChequeCard } from '@/components/cheque-card'
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
  Search01Icon as Search,
  Location01Icon as Location,
  TextFontIcon as TextIcon,
  PencilEdit01Icon as Pencil,
  File02Icon as FileText,
  FilterIcon as Filter,
  Invoice01Icon as ReceiptText,
  Tick02Icon as Check,
  Calendar03Icon as DateIcon,
  Money03Icon as AmountIcon,
  SortingAZ01Icon as AscIcon,
  SortingZA01Icon as DescIcon,
  CircleIcon as AllIcon,
  ArrowUpRight01Icon as IssuedIcon,
  ArrowDownLeft01Icon as ReceivedIcon,
  CheckmarkCircle01Icon as ClearedIcon,
  Cancel01Icon as BouncedIcon,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Input } from '@/components/ui/input'

import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { useRedirectIfDraft } from '@/features/drafts'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { type ChequeStatus, type ChequeWithRelations } from '@/types'
import { SpeedDialFab } from '@/components/speed-dial-fab'
import { EntityTagsSection } from '@/features/tags/components/tag-chips'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'

export default function AccountDetailPage() {
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const { id } = useParams() as { id: string }
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const display = useDisplayFormat(profile)
  const businessId = activeBusiness?.id

  const {
    account,
    accountCheques,
    filteredCheques,
    isLoading,
    updateChequeStatus,
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
  } = useAccountDetail(id, businessId)
  const chequeTagMap = useEntityTagMap(businessId, 'cheque')

  const clearFilters = () => {
    setSearch('')
    setFilter('All')
    setSortBy('date')
    setSortOrder('desc')
  }

  const sortOptions: Array<{
    label: string
    value: SortBy
    icon: typeof DateIcon
  }> = [
    { label: tc('date'), value: 'date', icon: DateIcon },
    { label: tc('amount'), value: 'amount', icon: AmountIcon },
  ]

  const orderOptions: Array<{
    label: string
    value: SortOrder
    icon: typeof DescIcon
  }> = [
    { label: tc('descending'), value: 'desc', icon: DescIcon },
    { label: tc('ascending'), value: 'asc', icon: AscIcon },
  ]

  const statusOptions: Array<{
    label: string
    value: ChequeStatus | 'All'
    icon: typeof AllIcon
  }> = [
    { label: tc('all'), value: 'All', icon: AllIcon },
    { label: tc('issued'), value: 'Issued', icon: IssuedIcon },
    { label: tc('received'), value: 'Received', icon: ReceivedIcon },
    { label: tc('cleared'), value: 'Cleared', icon: ClearedIcon },
    { label: tc('bounced'), value: 'Bounced', icon: BouncedIcon },
  ]

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
              imageUrl={account.bank?.logo_url}
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

        <div className="flex gap-2">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search}
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              leftIcon={Search}
              className="rounded-full  h-11 bg-canvas-parchment border-none"
              placeholder={t('searchChequesPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant={
                    filter !== 'All' ||
                    sortBy !== 'date' ||
                    sortOrder !== 'desc'
                      ? 'default'
                      : 'outline'
                  }
                  size="icon"
                  className={cn(
                    'rounded-full h-11 w-11 shrink-0',
                    filter === 'All' &&
                      sortBy === 'date' &&
                      sortOrder === 'desc' &&
                      'bg-white',
                  )}
                >
                  <HugeiconsIcon icon={Filter} className="h-5 w-5" />
                </Button>
              }
            />
            <SheetContent className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Filter}
                    className="h-5 w-5 text-primary"
                  />
                  {tc('sortAndFilter')}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-6 py-4">
                <FilterPillSection title={tc('sortBy')}>
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={sortBy === option.value}
                      onClick={() => setSortBy(option.value)}
                      className={filterPillClassName(sortBy === option.value)}
                    >
                      <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                      <span className="font-bold text-sm">{option.label}</span>
                    </button>
                  ))}
                </FilterPillSection>

                <FilterPillSection title={tc('order')}>
                  {orderOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={sortOrder === option.value}
                      onClick={() => setSortOrder(option.value)}
                      className={filterPillClassName(
                        sortOrder === option.value,
                      )}
                    >
                      <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                      <span className="font-bold text-sm">{option.label}</span>
                    </button>
                  ))}
                </FilterPillSection>

                <FilterPillSection title={tc('filterStatus')}>
                  {statusOptions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={filter === s.value}
                      onClick={() => setFilter(s.value)}
                      className={filterPillClassName(filter === s.value)}
                    >
                      <HugeiconsIcon icon={s.icon} className="h-4 w-4" />
                      <span className="font-bold text-sm">{s.label}</span>
                      {filter === s.value && (
                        <HugeiconsIcon
                          icon={Check}
                          className="h-4 w-4 stroke-[3]"
                        />
                      )}
                    </button>
                  ))}
                </FilterPillSection>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <DataState
          isLoading={false}
          data={filteredCheques}
          allData={accountCheques}
          onClearFilters={clearFilters}
          loadingComponent={
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          }
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
        >
          <div className="space-y-4">
            {filteredCheques?.map((cheque: ChequeWithRelations) => (
              <ChequeCard
                key={cheque.id}
                cheque={cheque}
                onStatusUpdate={updateChequeStatus}
                tags={chequeTagMap[cheque.id]}
              />
            ))}
          </div>
        </DataState>
      </div>

      <NativeTools destination="account" accountId={account.id} />

      <SpeedDialFab
        editHref={`/accounts/${id}/edit`}
        editLabel={t('editAccount')}
      />
    </div>
  )
}
