import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { announcementRepository } from '../repositories/announcement.repository'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
export function useAnnouncement() {
  const { profile } = useProfile()
  const client = useQueryClient()
  const key = queryKeys.announcements.latest(profile?.user_id)
  const query = useQuery({
    queryKey: key,
    queryFn: announcementRepository.latest,
    enabled: !!profile,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Developer message failed to load', query.error)
  }, [query.error])
  return {
    ...query,
    async acknowledge() {
      if (!query.data) throw new Error('No announcement loaded')
      await announcementRepository.acknowledge(query.data.id)
      await client.invalidateQueries({ queryKey: key })
    },
  }
}
