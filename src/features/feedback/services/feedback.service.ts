import { ValidationError } from '@/lib/errors'
import { feedbackRepository } from '@/features/feedback/repositories/feedback.repository'
import {
  feedbackPageRequestSchema,
  feedbackSubmissionSchema,
  type FeedbackPageRequest,
  type FeedbackSubmission,
} from '@/validators/feedback'

export const feedbackService = {
  async submit(input: FeedbackSubmission, userId: string) {
    const parsed = feedbackSubmissionSchema.safeParse(input)
    if (!parsed.success)
      throw new ValidationError('Review the feedback form and try again.')
    return feedbackRepository.submit(parsed.data, userId)
  },

  async myItems(request: FeedbackPageRequest) {
    const parsed = feedbackPageRequestSchema.safeParse(request)
    if (!parsed.success) throw new ValidationError('Invalid feedback page.')
    return feedbackRepository.myItems(parsed.data)
  },

  async roadmap(request: FeedbackPageRequest) {
    const parsed = feedbackPageRequestSchema.safeParse(request)
    if (!parsed.success) throw new ValidationError('Invalid roadmap page.')
    return feedbackRepository.roadmap(parsed.data)
  },

  async vote(feedbackId: string, userId: string, hasVoted: boolean) {
    return feedbackRepository.vote(feedbackId, userId, hasVoted)
  },
}
