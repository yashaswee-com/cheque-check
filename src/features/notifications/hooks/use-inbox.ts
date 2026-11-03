import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
import { inboxService } from '../services/inbox.service'
import {
  INBOX_MAX_PAGES,
  type InboxRequest,
} from '@/validators/notification-inbox'

export function useUnreadCount(businessId?: string) {
  const { profile } = useProfile()
  const [visible, setVisible] = useState(
    () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const result = useQuery({
    queryKey: queryKeys.inbox.count(profile?.user_id, businessId),
    queryFn: () => inboxService.count(businessId),
    enabled: !!profile && visible,
    staleTime: 30_000,
    refetchInterval: visible ? 60_000 : false,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (result.error)
      logger.error('Unread notifications failed to load', result.error)
  }, [result.error])
  return result
}

export function useInbox(request: InboxRequest) {
  const { profile } = useProfile()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.inbox.page(profile?.user_id, request),
    queryFn: () => inboxService.list(request),
    enabled: !!profile,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Notification inbox failed to load', query.error)
  }, [query.error])
  const totalPages = query.data
    ? Math.min(
        INBOX_MAX_PAGES,
        Math.ceil(query.data.total / query.data.page_size),
      )
    : 0
  return {
    ...query,
    totalPages,
    async markRead(id: string) {
      await inboxService.markRead(id)
      await client.invalidateQueries({ queryKey: queryKeys.inbox.all() })
    },
    async markAll() {
      if (!query.data) throw new Error('Load notifications before marking read')
      await inboxService.markAll(query.data.snapshot, request.businessId)
      await client.invalidateQueries({ queryKey: queryKeys.inbox.all() })
    },
  }
}
