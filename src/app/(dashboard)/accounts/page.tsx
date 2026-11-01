'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon as ChevronRight,
  Search01Icon as Search,
  BankIcon as Landmark,
  Sorting05Icon as Filter,
  Tick02Icon as Check,
  UserIcon as User,
  SortingAZ01Icon as AscIcon,
  SortingZA01Icon as DescIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { cn } from '@/lib/utils'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { useAccounts } from '@/features/accounts/hooks/use-accounts'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import { useTranslations } from 'next-intl'
import { DraftsLink } from '@/features/drafts'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { Account } from '@/types'
import { TagChips } from '@/features/tags/components/tag-chips'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'

export default function AccountsPage() {
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id

  const {
    accounts,
    filteredAccounts,
    uniqueBanks,
    isLoading,
    error,
    search,
    setSearch,
    sortOrder,
    setSortOrder,
    sortBy,
    setSortBy,
    bankFilter,
    setBankFilter,
  } = useAccounts(businessId)
  const tagMap = useEntityTagMap(businessId, 'account')

  const clearFilters = () => {
    setSearch('')
    setBankFilter('All')
  }

  const sortOptions = [
    { label: t('sortByAccountName'), value: 'account_name', icon: User },
    { label: t('sortByBankName'), value: 'bank_name', icon: Landmark },
  ]

  const orderOptions = [
    { label: tc('ascending'), value: 'asc', icon: AscIcon },
    { label: tc('descending'), value: 'desc', icon: DescIcon },
  ]

  return (
    <div className="max-w-2xl space-y-8 pb-24">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search}
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            leftIcon={Search}
            className="rounded-full  h-11 bg-canvas-parchment border-none"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant={bankFilter !== 'All' ? 'default' : 'outline'}
                size="icon"
                className={cn(
                  'rounded-full h-11 w-11 shrink-0',
                  bankFilter === 'All' && 'bg-white',
                )}
              >
                <HugeiconsIcon icon={Filter} className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent className="max-h-[80dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={Filter} className="h-5 w-5 text-primary" />
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
                    onClick={() => setSortBy(option.value as any)}
                    className={filterPillClassName(sortBy === option.value)}
                  >
                    <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                    <span className="font-bold text-sm">{option.label}</span>
                    {sortBy === option.value && (
                      <HugeiconsIcon
                        icon={Check}
                        className="h-4 w-4 stroke-[3]"
                      />
                    )}
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection title={tc('order')}>
                {orderOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={sortOrder === option.value}
                    onClick={() => setSortOrder(option.value as any)}
                    className={filterPillClassName(sortOrder === option.value)}
                  >
                    <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                    <span className="font-bold text-sm">{option.label}</span>
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection title={t('filterBank')}>
                <button
                  type="button"
                  aria-pressed={bankFilter === 'All'}
                  onClick={() => setBankFilter('All')}
                  className={filterPillClassName(bankFilter === 'All')}
                >
                  <HugeiconsIcon icon={Landmark} className="h-4 w-4" />
                  <span className="font-bold text-sm">{tc('allBanks')}</span>
                  {bankFilter === 'All' && (
                    <HugeiconsIcon
                      icon={Check}
                      className="h-4 w-4 stroke-[3]"
                    />
                  )}
                </button>
                {uniqueBanks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    aria-pressed={bankFilter === bank.id}
                    onClick={() => setBankFilter(bank.id)}
                    className={filterPillClassName(bankFilter === bank.id)}
                  >
                    <HugeiconsIcon
                      icon={Landmark}
                      className="h-4 w-4 opacity-50"
                    />
                    <span className="max-w-48 truncate font-bold text-sm">
                      {bank.name}
                    </span>
                    {bankFilter === bank.id && (
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

      <DraftsLink entity="account" />

      <div className="grid gap-4">
        <DataState
          isLoading={isLoading}
          isError={!!error}
          data={filteredAccounts}
          allData={accounts}
          onClearFilters={clearFilters}
          loadingComponent={
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          }
          emptyState={
            <EmptyState
              icon={Landmark}
              title={t('noAccountsTitle')}
              description={t('noAccountsDesc')}
              action={{
                label: t('addFirstAccount'),
                href: '/accounts/create',
              }}
            />
          }
        >
          {filteredAccounts?.map((account: Account) => (
            <Link key={account.id} href={`/accounts/${account.id}`}>
              <div className="group relative rounded-xl border bg-card p-5 transition-all active:scale-95 border-zinc-200 dark:border-zinc-800">
                <div className="flex items-start gap-4">
                  <EntityAvatar
                    name={account.bank?.name || tc('bank')}
                    color={account.color}
                    icon={account.icon}
                    imageUrl={account.bank?.logo_url}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <TextTruncate
                        text={account.account_name}
                        maxLength={25}
                        className="text-base font-bold"
                      />
                      <HugeiconsIcon
                        icon={ChevronRight}
                        className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform"
                      />
                    </div>
                    <TextTruncate
                      text={account.bank?.name || ''}
                      maxLength={30}
                      className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5 block"
                    />
                    <TagChips
                      tags={tagMap[account.id]}
                      max={2}
                      className="mt-1"
                    />
                    {account.is_default && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <HugeiconsIcon icon={Check} className="size-3" />
                        {t('defaultAccount')}
                      </span>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-dashed border-zinc-100 dark:border-zinc-800 pt-4">
                      <p className="text-xs font-mono text-muted-foreground tracking-tighter">
                        {account.account_number.replace(/\d(?=\d{4})/g, '•')}
                      </p>
                      <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[9px] font-semibold text-primary uppercase tracking-wider">
                        {account.ifsc_code || tc('noIfsc')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </DataState>
      </div>
    </div>
  )
}
