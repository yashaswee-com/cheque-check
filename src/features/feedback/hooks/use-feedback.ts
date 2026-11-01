'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { logger } from '@/lib/logger'
import { queryKeys } from '@/lib/query-keys'
import { feedbackService } from '../services/feedback.service'
import type {
  FeedbackPageRequest,
  FeedbackSubmission,
} from '@/validators/feedback'

export function useMyFeedback(request: FeedbackPageRequest = {}) {
  const { profile } = useProfile()
  const query = useQuery({
    queryKey: queryKeys.feedback.mine(profile?.user_id, request),
    queryFn: () => feedbackService.myItems(request),
    enabled: !!profile,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Private feedback failed to load', query.error)
  }, [query.error])
  return query
}

export function useRoadmap(request: FeedbackPageRequest = {}) {
  const { profile } = useProfile()
  const query = useQuery({
    queryKey: queryKeys.feedback.roadmap(profile?.user_id, request),
    queryFn: () => feedbackService.roadmap(request),
    enabled: !!profile,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error) logger.error('Roadmap failed to load', query.error)
  }, [query.error])
  return query
}

export function useSubmitFeedback() {
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (submission: FeedbackSubmission) => {
      if (!profile?.user_id) throw new Error('Sign in to send feedback.')
      return feedbackService.submit(submission, profile.user_id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.feedback.mine(profile?.user_id),
      })
    },
  })
}

export function useRoadmapVote() {
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      feedbackId,
      hasVoted,
    }: {
      feedbackId: string
      hasVoted: boolean
    }) => {
      if (!profile?.user_id) throw new Error('Sign in to vote.')
      return feedbackService.vote(feedbackId, profile.user_id, hasVoted)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.feedback.roadmapAll(),
      })
    },
  })
}
