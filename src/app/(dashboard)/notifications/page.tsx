'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  Building03Icon,
  DashboardSquare01Icon,
  Mail01Icon,
  MailOpen01Icon,
  Notification03Icon,
  RefreshIcon,
  Search01Icon,
  SortByDown02Icon,
  SortByUp02Icon,
  Sorting05Icon,
  Tick02Icon,
  TickDouble02Icon,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useInbox } from '@/features/notifications/hooks/use-inbox'
import {
  pushService,
  type PushState,
} from '@/features/notifications/services/push.service'
import { matchInboxSearch } from '@/features/notifications/lib/inbox-search'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoPopover } from '@/components/ui/info-popover'
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
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import type { InboxItem } from '@/validators/notification-inbox'

/** `undefined` follows the active business; `null` shows every business. */
type BusinessFilter = string | null | undefined

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function NotificationsPage() {
  const t = useTranslations('Inbox')
  const common = useTranslations('Common')
  const push = useTranslations('Push')
  const { activeBusiness, businesses, setActiveBusiness } = useBusiness()
  const router = useRouter()
  const display = useDisplayFormat()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [businessFilter, setBusinessFilter] =
    useState<BusinessFilter>(undefined)
  const [unread, setUnread] = useState(false)
  const [ascending, setAscending] = useState(false)
  const [pushState, setPushState] = useState<PushState | null>(null)
  useEffect(() => {
    let active = true
    void pushService
      .state()
      .then((state) => {
        if (active) setPushState(state)
      })
      .catch((error) => {
        logger.error('Push status failed to load', error)
      })
    return () => {
      active = false
    }
  }, [])
  const businessId =
    businessFilter === undefined
      ? activeBusiness?.id
      : (businessFilter ?? undefined)
  const match = matchInboxSearch(
    debouncedSearch,
    {
      cheque_reminder: t('events.cheque_reminder'),
      export_ready: t('events.export_ready'),
      export_failed: t('events.export_failed'),
    },
    businesses,
  )
  const filterKey = JSON.stringify([businessId, unread, ascending, match])
  const [paging, setPaging] = useState<{
    key: string
    page: number
    snapshot?: string
  }>({ key: filterKey, page: 0 })
  const current =
    paging.key === filterKey ? paging : { key: filterKey, page: 0 }
  const inbox = useInbox({
    businessId,
    unread,
    ascending,
    match,
    page: current.page,
    snapshot: current.snapshot,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const lock = useRef(false)
  const perform = async (operation: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(false)
    try {
      await operation()
    } catch (error) {
      logger.error('Notification action failed', error)
      setError(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const open = async (item: InboxItem) => {
    await inbox.markRead(item.id)
    const business = businesses.find(
      (business) => business.id === item.business_id,
    )
    if (!business) throw new Error('Notification business is unavailable')
    setActiveBusiness(business)
    router.push(item.kind === 'cheque_reminder' ? '/cheques' : '/reports/jobs')
  }
  const businessOptions: { id: string | null; label: string }[] = [
    { id: null, label: t('allBusinesses') },
    ...businesses.map((business) => ({
      id: business.id,
      label: business.name ?? '',
    })),
  ]
  const filtered = debouncedSearch.trim().length > 0
  const clearFilters = () => {
    setSearch('')
    setUnread(false)
  }
  const sortOptions = [
    { ascending: false, label: t('sortNewest'), icon: SortByDown02Icon },
    { ascending: true, label: t('sortOldest'), icon: SortByUp02Icon },
  ]
  const readOptions = [
    { unread: false, label: t('readAll'), icon: MailOpen01Icon },
    { unread: true, label: t('unread'), icon: Mail01Icon },
  ]
  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2" data-testid="inbox-toolbar">
        <div className="relative min-w-0 flex-1">
          <Input
            leftIcon={Search01Icon}
            type="search"
            aria-label={t('searchPlaceholder')}
            className="h-11 rounded-full border-none bg-canvas-parchment"
            placeholder={t('searchPlaceholder')}
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
                {sortOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={ascending === option.ascending}
                    onClick={() => setAscending(option.ascending)}
                    className={filterPillClassName(
                      ascending === option.ascending,
                    )}
                  >
                    <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                    <span className="text-sm font-bold">{option.label}</span>
                    {ascending === option.ascending && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className="h-4 w-4 stroke-3"
                      />
                    )}
                  </button>
                ))}
              </FilterPillSection>
              <FilterPillSection
                title={
                  <span className="flex items-center gap-1">
                    {t('business')}
                    <InfoPopover title={t('business')}>
                      {businessId ? t('activeScope') : t('allScope')}
                    </InfoPopover>
                  </span>
                }
              >
                {businessOptions.map((option) => {
                  const selected = (businessId ?? null) === option.id
                  return (
                    <button
                      key={option.id ?? 'all'}
                      type="button"
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => setBusinessFilter(option.id)}
                      className={filterPillClassName(selected)}
                    >
                      <HugeiconsIcon
                        icon={
                          option.id ? Building03Icon : DashboardSquare01Icon
                        }
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-bold">{option.label}</span>
                      {option.id && option.id === activeBusiness?.id && (
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {t('activeBusiness')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </FilterPillSection>
              <FilterPillSection title={t('readStatus')}>
                {readOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={unread === option.unread}
                    disabled={busy}
                    onClick={() => setUnread(option.unread)}
                    className={filterPillClassName(unread === option.unread)}
                  >
                    <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
                    <span className="text-sm font-bold">{option.label}</span>
                  </button>
                ))}
              </FilterPillSection>
            </div>
          </SheetContent>
        </Sheet>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('refresh')}
          title={t('refresh')}
          className="h-11 w-11 shrink-0 rounded-full bg-white"
          disabled={busy || inbox.isFetching}
          onClick={() => {
            setPaging({ key: filterKey, page: 0 })
            void inbox.refetch()
          }}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            className={cn('h-5 w-5', inbox.isFetching && 'animate-spin')}
          />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('markAll')}
          title={t('markAll')}
          className="h-11 w-11 shrink-0 rounded-full bg-white"
          disabled={busy || !inbox.data || inbox.isFetching}
          onClick={() => void perform(inbox.markAll)}
        >
          <HugeiconsIcon icon={TickDouble02Icon} className="h-5 w-5" />
        </Button>
      </div>
      {pushState && pushState !== 'enabled' && (
        <section
          aria-label={push('title')}
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-muted-foreground">
            {push('settingsRedirect')}
          </p>
          <Link
            href="/settings/notifications"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {push('settingsLink')}
          </Link>
        </section>
      )}
      {error && <p role="alert">{t('actionError')}</p>}
      {inbox.isLoading ? (
        <div
          role="status"
          aria-label={common('loading')}
          className="space-y-2"
          data-testid="inbox-loading"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-xl border p-3"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : inbox.error ? (
        <EmptyState
          role="alert"
          data-testid="inbox-error"
          icon={Alert02Icon}
          title={t('errorTitle')}
          description={t('errorDescription')}
          action={{
            label: t('retry'),
            onClick: () => void inbox.refetch(),
          }}
        />
      ) : !inbox.data?.items.length ? (
        filtered ? (
          <EmptyState
            role="status"
            data-testid="inbox-no-match"
            icon={Search01Icon}
            title={t('noMatchTitle')}
            description={t('noMatchDescription')}
            action={{ label: t('clearFilters'), onClick: clearFilters }}
          />
        ) : unread ? (
          <EmptyState
            role="status"
            data-testid="inbox-empty-unread"
            icon={MailOpen01Icon}
            title={t('noUnreadTitle')}
            description={t('noUnreadDescription')}
            action={{ label: t('showAll'), onClick: () => setUnread(false) }}
          />
        ) : (
          <EmptyState
            role="status"
            data-testid="inbox-empty"
            icon={Notification03Icon}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        )
      ) : (
        <ul className="space-y-2" data-testid="inbox-list">
          {inbox.data.items.map((item) => (
            <li key={item.id} className="rounded-xl border p-3">
              <Button
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal text-left"
                disabled={busy}
                onClick={() => void perform(() => open(item))}
              >
                <span>
                  <span className={item.read_at ? '' : 'font-bold'}>
                    {t(`events.${item.kind}`)}
                  </span>
                  {!item.read_at && (
                    <span className="ml-2 text-xs">{t('unread')}</span>
                  )}
                  <span className="block text-xs">
                    {businesses.find((b) => b.id === item.business_id)?.name}
                  </span>
                  <span className="block text-xs">
                    {display.date(item.created_at)}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!inbox.isLoading && !inbox.error && (
        <StickyPagination
          testId="notifications-pagination"
          page={current.page}
          totalPages={inbox.totalPages}
          disabled={busy || inbox.isFetching}
          onPrevious={() => setPaging({ ...current, page: current.page - 1 })}
          onNext={() =>
            setPaging({
              ...current,
              page: current.page + 1,
              snapshot: inbox.data?.snapshot,
            })
          }
        />
      )}
    </div>
  )
}
