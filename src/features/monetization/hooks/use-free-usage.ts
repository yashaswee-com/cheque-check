import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { getFreeUsage } from '../repositories/free-usage.repository'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
export function useFreeUsage() {
  const { profile } = useProfile()
  const client = useQueryClient()
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (
          event.type === 'updated' &&
          event.action.type === 'success' &&
          event.query.queryKey[0] === queryKeys.monetization.quotas()[0]
        ) {
          void client.invalidateQueries({
            queryKey: queryKeys.monetization.freeUsageAll(),
          })
        }
      }),
    [client],
  )
  const query = useQuery({
    queryKey: queryKeys.monetization.freeUsage(profile?.user_id),
    enabled: !!profile,
    queryFn: getFreeUsage,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
  useEffect(() => {
    if (query.error) logger.error('Free usage failed to load', query.error)
  }, [query.error])
  return query
}
