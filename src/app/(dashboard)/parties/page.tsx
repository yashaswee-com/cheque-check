'use client'

import { useParties } from '@/features/parties/hooks/use-parties'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon as Search,
  UserIcon as User,
  ArrowRight01Icon as ChevronRight,
  Sorting05Icon as Filter,
  Tick02Icon as Check,
  TextSquareIcon as NameIcon,
  Money03Icon as BalanceIcon,
  SortingAZ01Icon as AscIcon,
  SortingZA01Icon as DescIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityAvatar } from '@/components/ui/entity-avatar'
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
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import type { Party } from '@/types'
import { PARTY_TYPES } from '@/validators'
import { usePartyTypeLabel } from '@/features/parties/components/party-type-picker'
import { TagChips } from '@/features/tags/components/tag-chips'
import { useEntityTagMap } from '@/features/tags/hooks/use-entity-tags'
import { NativeTools } from '@/features/premium-workspace/components/native-tools'

export default function PartiesPage() {
  const t = useTranslations('Parties')
  const tCommon = useTranslations('Common')
  const { activeBusiness } = useBusiness()
  const { profile } = useProfile()
  const businessId = activeBusiness?.id

  const currency = profile?.currency || '₹'
  const display = useDisplayFormat(profile)

  const {
    parties,
    filteredParties,
    isLoading,
    error,
    search,
    setSearch,
    sortOrder,
    setSortOrder,
    sortBy,
    setSortBy,
    partyType,
    setPartyType,
    getBalance,
  } = useParties(businessId)
  const tagMap = useEntityTagMap(businessId, 'party')
  const partyTypeLabel = usePartyTypeLabel()

  const clearFilters = () => {
    setSearch('')
    setPartyType('all')
  }

  const sortOptions = [
    { label: t('sortByName'), value: 'name', icon: NameIcon },
    { label: t('sortByBalance'), value: 'balance', icon: BalanceIcon },
  ]

  const orderOptions = [
    { label: tCommon('ascending'), value: 'asc', icon: AscIcon },
    { label: tCommon('descending'), value: 'desc', icon: DescIcon },
  ]

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="flex gap-3">
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
                variant="outline"
                size="icon"
                className="rounded-full h-11 w-11 shrink-0 bg-white"
              >
                <HugeiconsIcon icon={Filter} className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={Filter} className="h-5 w-5 text-primary" />
                {tCommon('sortAndFilter')}
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-6 py-4">
              <FilterPillSection title={tCommon('sortBy')}>
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

              <FilterPillSection title={tCommon('order')}>
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

              <FilterPillSection title={t('partyType')}>
                {(['all', ...PARTY_TYPES] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={partyType === value}
                    onClick={() => setPartyType(value)}
                    className={filterPillClassName(partyType === value)}
                  >
                    <span className="font-bold text-sm">
                      {value === 'all'
                        ? t('partyTypeAll')
                        : partyTypeLabel(value)}
                    </span>
                  </button>
                ))}
              </FilterPillSection>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <DraftsLink entity="party" />
      <NativeTools destination="parties" businessId={businessId} />

      <div className="space-y-4">
        <DataState
          isLoading={isLoading}
          isError={!!error}
          data={filteredParties}
          allData={parties}
          onClearFilters={clearFilters}
          loadingComponent={
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          }
          emptyState={
            <EmptyState
              icon={User}
              title={t('noPartiesTitle')}
              description={t('noPartiesDesc')}
              action={{
                label: t('addFirstParty'),
                href: '/parties/create',
              }}
            />
          }
        >
          {filteredParties?.map((party: Party) => (
            <Link
              key={party.id}
              href={`/parties/${party.id}`}
              className="block"
            >
              <div className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-all active:scale-95 border-zinc-200 dark:border-zinc-800">
                <EntityAvatar
                  name={party.name}
                  color={party.color}
                  icon={party.icon}
                  imageUrl={party.avatar_url}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <TextTruncate
                    text={party.name}
                    maxLength={25}
                    className="font-bold text-base"
                  />
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                    {party.party_type
                      ? `${partyTypeLabel(party.party_type)} · ${party.contact}`
                      : party.contact}
                  </p>
                  <TagChips tags={tagMap[party.id]} max={2} className="mt-1" />
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {tCommon('balance')}
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {currency}
                    {display.number(getBalance(party.id))}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ChevronRight}
                  className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform"
                />
              </div>
            </Link>
          ))}
        </DataState>
      </div>
    </div>
  )
}
