import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { referralRepository } from '../repositories/referral.repository'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
export function useReferrals() {
  const { profile } = useProfile()
  const client = useQueryClient()
  const key = queryKeys.referrals.summary(profile?.user_id)
  const query = useQuery({
    queryKey: key,
    queryFn: referralRepository.summary,
    enabled: !!profile,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error) logger.error('Referrals failed to load', query.error)
  }, [query.error])
  return {
    ...query,
    isLoading: query.isPending,
    async apply(code: string) {
      await referralRepository.apply(code)
      await client.invalidateQueries({ queryKey: key })
    },
  }
}
