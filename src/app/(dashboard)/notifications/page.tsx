'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useInbox } from '@/features/notifications/hooks/use-inbox'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import type { InboxItem, InboxRequest } from '@/validators/notification-inbox'

export default function NotificationsPage() {
  const t = useTranslations('Inbox')
  const common = useTranslations('Common')
  const { activeBusiness, businesses, setActiveBusiness } = useBusiness()
  const router = useRouter()
  const display = useDisplayFormat()
  const [request, setRequest] = useState<InboxRequest>({})
  const [history, setHistory] = useState<InboxRequest[]>([])
  const inbox = useInbox(request)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const lock = useRef(false)
  const reset = (next: InboxRequest = {}) => {
    setRequest(next)
    setHistory([])
  }
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
  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => reset({ unread: request.unread })}
        >
          {t('allBusinesses')}
        </Button>
        <Button
          variant="outline"
          disabled={!activeBusiness || busy}
          onClick={() =>
            reset({ unread: request.unread, businessId: activeBusiness?.id })
          }
        >
          {t('activeBusiness')}
        </Button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={request.unread ?? false}
            disabled={busy}
            onChange={(event) =>
              reset({
                businessId: request.businessId,
                unread: event.target.checked,
              })
            }
          />
          {t('unreadOnly')}
        </label>
        <Button
          variant="outline"
          disabled={busy || inbox.isFetching}
          onClick={() => {
            reset({ businessId: request.businessId, unread: request.unread })
            void inbox.refetch()
          }}
        >
          {t('refresh')}
        </Button>
        <Button
          disabled={busy || !inbox.data || inbox.isFetching}
          onClick={() => void perform(inbox.markAll)}
        >
          {t('markAll')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {request.businessId ? t('activeScope') : t('allScope')}
      </p>
      {error && <p role="alert">{t('actionError')}</p>}
      {inbox.isLoading ? (
        <p role="status">{common('loading')}</p>
      ) : inbox.error ? (
        <p role="alert">{common('loadDataError')}</p>
      ) : !inbox.data?.items.length ? (
        <p role="status">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
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
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!history.length || busy}
          onClick={() => {
            setRequest(history[history.length - 1])
            setHistory(history.slice(0, -1))
          }}
        >
          {t('previous')}
        </Button>
        <Button
          variant="outline"
          disabled={!inbox.data?.next_cursor || busy}
          onClick={() => {
            if (!inbox.data?.next_cursor) return
            setHistory([...history, request])
            setRequest({
              ...request,
              before: inbox.data.next_cursor,
              snapshot: inbox.data.snapshot,
            })
          }}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
