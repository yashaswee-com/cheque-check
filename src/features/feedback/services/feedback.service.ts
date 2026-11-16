import { ValidationError } from '@/lib/errors'
import { feedbackRepository } from '@/features/feedback/repositories/feedback.repository'
import {
  encodeAttachment,
  validateAttachmentFiles,
} from '@/lib/attachment-files'
import {
  feedbackPageRequestSchema,
  privateFeedbackPageRequestSchema,
  feedbackSubmissionSchema,
  type FeedbackPageRequest,
  type FeedbackSubmission,
  type PrivateFeedbackPageRequest,
} from '@/validators/feedback'

export const feedbackService = {
  attachments(ids: string[]) {
    return feedbackRepository.attachments(ids)
  },

  readAttachment(id: string) {
    return feedbackRepository.readAttachment(id)
  },

  async submit(
    input: FeedbackSubmission,
    userId: string,
    attachments: File[] = [],
  ) {
    const parsed = feedbackSubmissionSchema.safeParse(input)
    if (!parsed.success)
      throw new ValidationError('Review the feedback form and try again.')
    if (!validateAttachmentFiles(attachments))
      throw new ValidationError('Invalid feedback attachments')
    if (!attachments.length)
      return feedbackRepository.submit(parsed.data, userId)
    const encoded = await Promise.all(attachments.map(encodeAttachment))
    return feedbackRepository.submitWithAttachments(parsed.data, encoded)
  },

  async myItems(request: PrivateFeedbackPageRequest) {
    const parsed = privateFeedbackPageRequestSchema.safeParse(request)
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
