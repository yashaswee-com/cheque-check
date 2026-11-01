'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { emailLinkRepository } from '../repositories/email-link.repository'
export function useEmailLink() {
  const { profile } = useProfile()
  const client = useQueryClient()
  const key = ['verified-email', profile?.user_id] as const
  const query = useQuery({
    queryKey: key,
    queryFn: emailLinkRepository.identity,
    enabled: !!profile,
    refetchOnWindowFocus: 'always',
  })
  return {
    ...query,
    send: emailLinkRepository.send,
    refresh: () => client.invalidateQueries({ queryKey: key }),
  }
}
