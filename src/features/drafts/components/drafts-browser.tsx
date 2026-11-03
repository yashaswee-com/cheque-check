'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  BankIcon,
  DashboardSquare01Icon,
  Invoice01Icon,
  NoteEditIcon,
  Search01Icon,
  SortByDown02Icon,
  SortByUp02Icon,
  Sorting05Icon,
  Tick02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { StickyPagination } from '@/components/ui/sticky-pagination'
import { toast } from '@/components/ui/toast'
import { DRAFT_PAGE_SIZE } from '@/validators/draft-page'
import type { AccountDraft, ChequeDraft, PartyDraft } from '@/types'
import { DRAFT_CREATE_PATHS, type DraftEntity } from '../lib/draft-fields'
import {
  draftsHref,
  parseDraftsParams,
  type DraftsParams,
} from '../lib/drafts-params'
import {
  useDeleteDraft,
  useDraftCounts,
  useDraftsPage,
} from '../hooks/use-drafts'
import type { DraftPageItem } from '../repositories/draft-page.repository'
import { DraftCard, type DraftCardProps } from './draft-card'

type Describe = Omit<DraftCardProps, 'href' | 'updatedAt' | 'onDelete'>

export const DRAFT_TYPE_ICONS = {
  cheque: Invoice01Icon,
  party: UserGroupIcon,
  account: BankIcon,
} as const

function useDescribeDraft() {
  const t = useTranslations('Drafts')
  const tc = useTranslations('Common')
  const tCheques = useTranslations('Cheques')
  const display = useDisplayFormat()
  return (item: DraftPageItem): Describe => {
    if (item.entity === 'cheque') {
      const cheque: ChequeDraft = item.draft
      const amount =
        cheque.amount != null ? display.currency(cheque.amount) : null
      return {
        title: amount ?? cheque.party?.name ?? t('untitled'),
        subtitle: amount ? cheque.party?.name : null,
        meta: [
          t('cheque'),
          cheque.type === 'Inward'
            ? tCheques('received')
            : cheque.type === 'Outward'
              ? tCheques('issued')
              : null,
          cheque.cheque_number ? `#${cheque.cheque_number}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        avatar: {
          name: cheque.party?.name || '?',
          color: cheque.party?.color,
          imageUrl: cheque.party?.avatar_url,
        },
      }
    }
    if (item.entity === 'party') {
      const party: PartyDraft = item.draft
      return {
        title: party.name || t('untitled'),
        subtitle: party.contact,
        meta: t('party'),
        avatar: {
          name: party.name || '?',
          color: party.color,
          imageUrl: party.avatar_url,
        },
      }
    }
    const account: AccountDraft = item.draft
    return {
      title: account.account_name || t('untitled'),
      subtitle: account.account_number
        ? `${account.bank?.name ?? tc('bank')} (${account.account_number.slice(-4)})`
        : account.bank?.name,
      meta: t('account'),
      avatar: {
        name: account.bank?.name || account.account_name || '?',
        color: account.color,
        imageUrl: account.logo_url ?? account.bank?.logo_url,
      },
    }
  }
}

function DraftRow({
  item,
  businessId,
}: {
  item: DraftPageItem
  businessId: string | undefined
}) {
  const t = useTranslations('Drafts')
  const describe = useDescribeDraft()
  const deleteDraft = useDeleteDraft(item.entity, businessId)
  return (
    <DraftCard
      href={`${DRAFT_CREATE_PATHS[item.entity]}?draftId=${item.draft.id}`}
      updatedAt={item.draft.updated_at}
      onDelete={async () => {
        await deleteDraft.mutateAsync(item.draft.id)
        toast.add({ title: t('deleted'), type: 'success' })
      }}
      {...describe(item)}
    />
  )
}

export function DraftsBrowser() {
  const t = useTranslations('Drafts')
  const common = useTranslations('Common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = parseDraftsParams(searchParams)
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id
  const [search, setSearch] = useState(params.search)

  const navigate = (next: Partial<DraftsParams>) => {
    const href = draftsHref({ ...params, page: 0, ...next })
    router.replace(href, { scroll: false })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== params.search.trim()) navigate({ search })
    }, 250)
    return () => clearTimeout(timer)
    // navigate is recreated each render; only the typed value drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const drafts = useDraftsPage(businessId, {
    types: params.type ? [params.type] : [],
    search: params.search,
    ascending: params.ascending,
    page: params.page,
  })
  const counts = useDraftCounts(businessId).data
  const total = drafts.data?.total ?? 0
  const totalPages = Math.ceil(total / DRAFT_PAGE_SIZE)
  const items = drafts.data?.items ?? []
  const outOfRange =
    !!drafts.data && !drafts.isPlaceholderData && !items.length && total > 0

  useEffect(() => {
    if (outOfRange) navigate({ page: totalPages - 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, totalPages])

  const filtered = !!params.search.trim()
  const clearSearch = () => {
    setSearch('')
    navigate({ search: '' })
  }
  const typeOptions: {
    value: DraftEntity | null
    label: string
    icon: typeof NoteEditIcon
    count?: number
  }[] = [
    {
      value: null,
      label: t('allTypes'),
      icon: DashboardSquare01Icon,
      count: counts && counts.cheque + counts.party + counts.account,
    },
    {
      value: 'cheque',
      label: t('cheques'),
      icon: DRAFT_TYPE_ICONS.cheque,
      count: counts?.cheque,
    },
    {
      value: 'party',
      label: t('parties'),
      icon: DRAFT_TYPE_ICONS.party,
      count: counts?.party,
    },
    {
      value: 'account',
      label: t('accounts'),
      icon: DRAFT_TYPE_ICONS.account,
      count: counts?.account,
    },
  ]
  const sortOptions = [
    { ascending: false, label: t('sortNewest'), icon: SortByDown02Icon },
    { ascending: true, label: t('sortOldest'), icon: SortByUp02Icon },
  ]

  return (
    <div className="max-w-2xl space-y-4 pb-24">
      <div className="flex items-center gap-2" data-testid="drafts-toolbar">
        <div className="relative min-w-0 flex-1">
          <Input
            leftIcon={Search01Icon}
            type="search"
            aria-label={t('searchPlaceholder')}
            className="h-11 rounded-full border-none bg-canvas-parchment"
            placeholder={t('searchPlaceholder')}
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={common('sortAndFilter')}
                className="h-11 w-11 shrink-0 rounded-full bg-white"
              >
                <HugeiconsIcon icon={Sorting05Icon} className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Sorting05Icon}
                  className="h-5 w-5 text-primary"
                />
                {common('sortAndFilter')}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-6 py-4">
              <FilterPillSection title={common('sortBy')}>
                {sortOptions.map((option) => {
                  const selected = params.ascending === option.ascending
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => navigate({ ascending: option.ascending })}
                      className={filterPillClassName(selected)}
                    >
                      <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                      <span className="text-sm font-bold">{option.label}</span>
                      {selected && (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="h-4 w-4 stroke-[3]"
                        />
                      )}
                    </button>
                  )
                })}
              </FilterPillSection>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div
        role="group"
        aria-label={t('typeFilter')}
        className="flex gap-2 overflow-x-auto pb-1"
        data-testid="drafts-type-pills"
      >
        {typeOptions.map((option) => {
          const selected = params.type === option.value
          return (
            <button
              key={option.value ?? 'all'}
              type="button"
              aria-pressed={selected}
              onClick={() => navigate({ type: option.value })}
              className={filterPillClassName(selected)}
            >
              <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
              <span className="text-sm font-bold">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-xs font-semibold tabular-nums opacity-70">
                  {option.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {drafts.isLoading || (!businessId && !drafts.data) ? (
        <div
          role="status"
          aria-label={common('loading')}
          className="space-y-3"
          data-testid="drafts-loading"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-lg border border-dashed p-4"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : drafts.error ? (
        <EmptyState
          role="alert"
          data-testid="drafts-error"
          icon={Alert02Icon}
          title={t('errorTitle')}
          description={t('errorDescription')}
          action={{ label: t('retry'), onClick: () => void drafts.refetch() }}
        />
      ) : !items.length ? (
        filtered ? (
          <EmptyState
            role="status"
            data-testid="drafts-no-match"
            icon={Search01Icon}
            title={t('noMatchTitle')}
            description={t('noMatchDescription')}
            action={{ label: t('clearSearch'), onClick: clearSearch }}
          />
        ) : (
          <EmptyState
            role="status"
            data-testid="drafts-empty"
            icon={NoteEditIcon}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        )
      ) : (
        <ul className="space-y-3" data-testid="drafts-list">
          {items.map((item) => (
            <li key={`${item.entity}-${item.draft.id}`}>
              <DraftRow item={item} businessId={businessId} />
            </li>
          ))}
        </ul>
      )}
      {!drafts.isLoading && !drafts.error && (
        <StickyPagination
          testId="drafts-pagination"
          page={params.page}
          totalPages={totalPages}
          disabled={drafts.isFetching}
          onPrevious={() => navigate({ page: params.page - 1 })}
          onNext={() => navigate({ page: params.page + 1 })}
        />
      )}
    </div>
  )
}
