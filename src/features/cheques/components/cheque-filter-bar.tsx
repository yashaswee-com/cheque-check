'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon as Search,
  Sorting05Icon as Filter,
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { ChequeStatus } from '@/types'
import type { SortBy, SortOrder } from '../hooks/use-cheques'

export interface ChequeFilterBarProps {
  search: string
  setSearch: (value: string) => void
  filter: ChequeStatus | 'All'
  setFilter: (value: ChequeStatus | 'All') => void
  sortBy: SortBy
  setSortBy: (value: SortBy) => void
  sortOrder: SortOrder
  setSortOrder: (value: SortOrder) => void
  advancedFilters?: React.ReactNode
  hasAdvancedFilters?: boolean
}

export function ChequeFilterBar({
  search,
  setSearch,
  filter,
  setFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  advancedFilters,
  hasAdvancedFilters,
}: ChequeFilterBarProps) {
  const t = useTranslations('Cheques')
  const tCommon = useTranslations('Common')

  const statusOptions = [
    { label: tCommon('all'), value: 'All', icon: AllIcon },
    { label: tCommon('issued'), value: 'Issued', icon: IssuedIcon },
    { label: tCommon('received'), value: 'Received', icon: ReceivedIcon },
    { label: tCommon('cleared'), value: 'Cleared', icon: ClearedIcon },
    { label: tCommon('bounced'), value: 'Bounced', icon: BouncedIcon },
  ] as const

  const sortOptions = [
    { label: t('sortDate'), value: 'date', icon: DateIcon },
    { label: t('sortAmount'), value: 'amount', icon: AmountIcon },
  ] as const

  const orderOptions = [
    { label: tCommon('ascending'), value: 'asc', icon: AscIcon },
    { label: tCommon('descending'), value: 'desc', icon: DescIcon },
  ] as const

  const isDefault =
    filter === 'All' &&
    sortBy === 'date' &&
    sortOrder === 'desc' &&
    !hasAdvancedFilters

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <HugeiconsIcon
          icon={Search}
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          leftIcon={Search}
          data-testid="cheque-search-input"
          className="rounded-full h-11 bg-canvas-parchment border-none"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant={isDefault ? 'outline' : 'default'}
              size="icon"
              data-testid="cheque-filter-trigger"
              className={cn(
                'rounded-full h-11 w-11 shrink-0',
                isDefault && 'bg-white',
              )}
            >
              <HugeiconsIcon icon={Filter} className="h-5 w-5" />
            </Button>
          }
        />
        <SheetContent className="max-h-[85dvh]">
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
                  data-testid={`cheque-sort-by-${option.value}`}
                  aria-pressed={sortBy === option.value}
                  onClick={() => setSortBy(option.value)}
                  className={filterPillClassName(sortBy === option.value)}
                >
                  <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                  <span className="font-normal text-sm">{option.label}</span>
                </button>
              ))}
            </FilterPillSection>

            <FilterPillSection title={tCommon('order')}>
              {orderOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-testid={`cheque-sort-order-${option.value}`}
                  aria-pressed={sortOrder === option.value}
                  onClick={() => setSortOrder(option.value)}
                  className={filterPillClassName(sortOrder === option.value)}
                >
                  <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                  <span className="font-normal text-sm">{option.label}</span>
                </button>
              ))}
            </FilterPillSection>

            {advancedFilters ?? (
              <FilterPillSection title={t('filterStatus')}>
                {statusOptions.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    data-testid={`cheque-filter-status-${s.value.toLowerCase()}`}
                    aria-pressed={filter === s.value}
                    onClick={() => setFilter(s.value as ChequeStatus | 'All')}
                    className={filterPillClassName(filter === s.value)}
                  >
                    <HugeiconsIcon icon={s.icon} className="h-4 w-4" />
                    <span className="font-normal text-sm">
                      {tCommon(s.value.toLowerCase() as never)}
                    </span>
                    {filter === s.value && (
                      <HugeiconsIcon
                        icon={Check}
                        className="h-4 w-4 stroke-[3]"
                      />
                    )}
                  </button>
                ))}
              </FilterPillSection>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
