import { z } from 'zod'

export const feedbackCategories = ['bug', 'feature', 'other'] as const
export const feedbackStatuses = [
  'under_review',
  'planned',
  'in_progress',
  'shipped',
  'declined',
] as const

export const feedbackCursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
})

export const feedbackSubmissionSchema = z.object({
  category: z.enum(feedbackCategories),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
})

export const feedbackPageRequestSchema = z.object({
  before: feedbackCursorSchema.optional(),
  limit: z.number().int().min(1).max(50).default(25),
})

const feedbackFields = {
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: z.enum(feedbackStatuses),
  created_at: z.iso.datetime({ offset: true }),
}

export const privateFeedbackItemSchema = z.object({
  ...feedbackFields,
  category: z.enum(feedbackCategories),
  roadmap_published: z.boolean(),
})

export const roadmapItemSchema = z.object({
  ...feedbackFields,
  vote_count: z.number().int().nonnegative(),
  has_voted: z.boolean(),
})

export const privateFeedbackPageSchema = z.object({
  items: z.array(privateFeedbackItemSchema).max(50),
  next_cursor: feedbackCursorSchema.nullable(),
})

export const roadmapPageSchema = z.object({
  items: z.array(roadmapItemSchema).max(50),
  next_cursor: feedbackCursorSchema.nullable(),
})

export type FeedbackCategory = (typeof feedbackCategories)[number]
export type FeedbackStatus = (typeof feedbackStatuses)[number]
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>
export type FeedbackCursor = z.infer<typeof feedbackCursorSchema>
export type FeedbackPageRequest = z.input<typeof feedbackPageRequestSchema>
export type PrivateFeedbackItem = z.infer<typeof privateFeedbackItemSchema>
export type RoadmapItem = z.infer<typeof roadmapItemSchema>
export type PrivateFeedbackPage = z.infer<typeof privateFeedbackPageSchema>
export type RoadmapPage = z.infer<typeof roadmapPageSchema>
