'use client'

import { StickyPagination } from '@/components/ui/sticky-pagination'
import { usePagedItems } from '@/hooks/use-paged-items'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon as Search,
  LabelIcon as TagIcon,
  ArrowRight01Icon as ChevronRight,
  Sorting05Icon as Filter,
  Tick02Icon as Check,
  TextSquareIcon as NameIcon,
  Calendar03Icon as CreatedIcon,
  Analytics01Icon as UsageIcon,
  SortingAZ01Icon as AscIcon,
  SortingZA01Icon as DescIcon,
  CircleIcon as AllUsageIcon,
  CheckmarkCircle01Icon as UsedIcon,
  CircleOffIcon as UnusedIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DataState } from '@/components/ui/data-state'
import { EmptyState } from '@/components/ui/empty-state'
import { TextTruncate } from '@/components/ui/text-truncate'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useTagList } from '@/features/tags/hooks/use-tag-list'
import { TAG_COLORS } from '@/features/tags/lib/tag-colors'
import type { TagSortBy, TagUsageFilter } from '@/features/tags/lib/tag-list'
import { cn } from '@/lib/utils'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'

export default function TagsPage() {
  const t = useTranslations('Tags')
  const tCommon = useTranslations('Common')
  const { activeBusiness } = useBusiness()
  const {
    tags,
    filteredTags,
    isLoading,
    error,
    search,
    setSearch,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    color,
    setColor,
    usage,
    setUsage,
    clearFilters,
  } = useTagList(activeBusiness?.id)
  const paged = usePagedItems(
    filteredTags,
    JSON.stringify([
      activeBusiness?.id,
      search,
      sortBy,
      sortOrder,
      color,
      usage,
    ]),
  )

  const sortOptions: { label: string; value: TagSortBy; icon: any }[] = [
    { label: t('sortByName'), value: 'name', icon: NameIcon },
    { label: t('sortByCreated'), value: 'created', icon: CreatedIcon },
    { label: t('sortByUsage'), value: 'usage', icon: UsageIcon },
  ]
  const orderOptions = [
    { label: tCommon('ascending'), value: 'asc' as const, icon: AscIcon },
    { label: tCommon('descending'), value: 'desc' as const, icon: DescIcon },
  ]
  const usageOptions: {
    label: string
    value: TagUsageFilter
    icon: typeof AllUsageIcon
  }[] = [
    { label: tCommon('all'), value: 'all', icon: AllUsageIcon },
    { label: t('used'), value: 'used', icon: UsedIcon },
    { label: t('unused'), value: 'unused', icon: UnusedIcon },
  ]
  const hasActiveFilters = !!color || usage !== 'all'

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Input
            leftIcon={Search}
            className="h-11 rounded-full border-none bg-canvas-parchment"
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
                aria-label={tCommon('sortAndFilter')}
                className="relative h-11 w-11 shrink-0 rounded-full bg-white"
              >
                <HugeiconsIcon icon={Filter} className="h-5 w-5" />
                {hasActiveFilters && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
                )}
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
                    onClick={() => setSortBy(option.value)}
                    className={filterPillClassName(sortBy === option.value)}
                  >
                    <HugeiconsIcon
                      icon={option.icon}
                      className="h-4 w-4"
                      data-filter-option-icon
                    />
                    <span className="text-sm font-bold">{option.label}</span>
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
                    onClick={() => setSortOrder(option.value)}
                    className={filterPillClassName(sortOrder === option.value)}
                  >
                    <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                    <span className="text-sm font-bold">{option.label}</span>
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection title={t('filterUsage')}>
                {usageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={usage === option.value}
                    onClick={() => setUsage(option.value)}
                    className={filterPillClassName(usage === option.value)}
                  >
                    <HugeiconsIcon
                      icon={option.icon}
                      className="h-4 w-4"
                      data-filter-option-icon
                    />
                    <span className="text-sm font-bold">{option.label}</span>
                  </button>
                ))}
              </FilterPillSection>

              <FilterPillSection
                title={t('filterColor')}
                scrollerClassName="gap-3 p-1"
              >
                <button
                  type="button"
                  aria-pressed={!color}
                  onClick={() => setColor(null)}
                  className={cn(
                    'h-9 shrink-0 snap-start whitespace-nowrap rounded-full border px-3 text-xs font-bold',
                    !color
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted/30',
                  )}
                >
                  {tCommon('all')}
                </button>
                {TAG_COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.name}
                    aria-pressed={color === option.value}
                    onClick={() =>
                      setColor(color === option.value ? null : option.value)
                    }
                    className={cn(
                      'flex size-9 shrink-0 snap-start items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-transform active:scale-90',
                      color === option.value && 'ring-2 ring-foreground/70',
                    )}
                    style={{ backgroundColor: option.value }}
                  >
                    {color === option.value && (
                      <HugeiconsIcon icon={Check} className="size-4" />
                    )}
                  </button>
                ))}
              </FilterPillSection>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4">
        <DataState
          isLoading={!activeBusiness || isLoading}
          isError={!!error}
          data={filteredTags}
          allData={tags}
          onClearFilters={clearFilters}
          noResultsTitle={tCommon('noTagsMatch')}
          loadingComponent={
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          }
          emptyState={
            <EmptyState
              icon={TagIcon}
              title={t('noTagsTitle')}
              description={t('noTagsDesc')}
              action={{ label: t('addFirstTag'), href: '/tags/create' }}
            />
          }
        >
          {paged.items?.map((tag) => (
            <Link key={tag.id} href={`/tags/${tag.id}`} className="block">
              <div className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-card p-4 transition-all active:scale-95 dark:border-zinc-800">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  <HugeiconsIcon icon={TagIcon} className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <TextTruncate
                    text={tag.name}
                    maxLength={25}
                    className="text-base font-bold"
                  />
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('usageCount', { count: tag.usage_count })}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ChevronRight}
                  className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </Link>
          ))}
        </DataState>
        {!isLoading && !error && (
          <StickyPagination
            page={paged.page}
            totalPages={paged.totalPages}
            onPrevious={paged.previous}
            onNext={paged.next}
            testId="tags-pagination"
          />
        )}
      </div>
    </div>
  )
}
