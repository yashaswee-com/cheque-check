'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Building03Icon,
  DashboardSquare01Icon,
  Mail01Icon,
  MailOpen01Icon,
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
import { matchInboxSearch } from '@/features/notifications/lib/inbox-search'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { PushSettings } from '@/features/notifications/components/push-settings'
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
  const { activeBusiness, businesses, setActiveBusiness } = useBusiness()
  const router = useRouter()
  const display = useDisplayFormat()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [businessFilter, setBusinessFilter] =
    useState<BusinessFilter>(undefined)
  const [unread, setUnread] = useState(false)
  const [ascending, setAscending] = useState(false)
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
                        className="h-4 w-4 stroke-[3]"
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
      <PushSettings />
      {error && <p role="alert">{t('actionError')}</p>}
      {inbox.isLoading ? (
        <p role="status">{common('loading')}</p>
      ) : inbox.error ? (
        <p role="alert">{common('loadDataError')}</p>
      ) : !inbox.data?.items.length ? (
        <p role="status">{t('empty')}</p>
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
