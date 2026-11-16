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
  PrivateFeedbackPageRequest,
} from '@/validators/feedback'

export function useMyFeedback(
  request: PrivateFeedbackPageRequest = {},
  enabled = true,
) {
  const { profile } = useProfile()
  const query = useQuery({
    queryKey: queryKeys.feedback.mine(profile?.user_id, request),
    queryFn: () => feedbackService.myItems(request),
    enabled: enabled && !!profile,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Private feedback failed to load', query.error)
  }, [query.error])
  return query
}

export function useFeedbackAttachments(ids: string[]) {
  const { profile } = useProfile()
  const query = useQuery({
    queryKey: queryKeys.feedback.attachments(profile?.user_id, ids),
    queryFn: () => feedbackService.attachments(ids),
    enabled: !!profile && ids.length > 0,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Feedback attachments failed to load', query.error)
  }, [query.error])
  return query
}

export function useFeedbackAttachmentDownload() {
  return useMutation({
    mutationFn: (id: string) => feedbackService.readAttachment(id),
  })
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
    mutationFn: ({
      submission,
      attachments,
    }: {
      submission: FeedbackSubmission
      attachments: File[]
    }) => {
      if (!profile?.user_id) throw new Error('Sign in to send feedback.')
      return feedbackService.submit(submission, profile.user_id, attachments)
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
