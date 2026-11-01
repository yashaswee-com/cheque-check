import { createClient } from '@/lib/supabase/client'
import { TABLES } from '@/lib/supabase/tables'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import {
  privateFeedbackItemSchema,
  privateFeedbackPageSchema,
  roadmapPageSchema,
  type FeedbackCursor,
  type FeedbackSubmission,
  type PrivateFeedbackPage,
  type RoadmapPage,
} from '@/validators/feedback'

export const feedbackRepository = {
  async submit(submission: FeedbackSubmission, userId: string) {
    const result = await createClient()
      .from(TABLES.FEEDBACK_ITEMS)
      .insert({ ...submission, user_id: userId })
      .select(
        'id, category, title, description, status, roadmap_published, created_at',
      )
      .single()
    if (result.error) {
      if (
        result.error.code === 'P0001' &&
        (result.error.details?.includes('feedback_rate_limited') ||
          result.error.message.includes('Feedback submission limit reached'))
      ) {
        throw new Error('FEEDBACK_RATE_LIMIT')
      }
      throw result.error
    }
    return parseDatabaseValue(
      result.data,
      privateFeedbackItemSchema,
      'feedback submission',
    )
  },

  async myItems(request: {
    before?: FeedbackCursor
    limit?: number
  }): Promise<PrivateFeedbackPage> {
    const limit = request.limit ?? 25
    const result = unwrapSupabaseResult(
      await createClient().rpc('list_my_feedback', {
        requested_before_created_at: request.before?.createdAt,
        requested_before_id: request.before?.id,
        requested_limit: limit,
      }),
    )
    const rows = result.slice(0, limit)
    const hasMore = result.length > rows.length
    const last = rows.at(-1)
    return parseDatabaseValue(
      {
        items: rows,
        next_cursor:
          hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
      },
      privateFeedbackPageSchema,
      'private feedback page',
    )
  },

  async roadmap(request: {
    before?: FeedbackCursor
    limit?: number
  }): Promise<RoadmapPage> {
    const limit = request.limit ?? 25
    const result = unwrapSupabaseResult(
      await createClient().rpc('list_feedback_roadmap', {
        requested_before_created_at: request.before?.createdAt,
        requested_before_id: request.before?.id,
        requested_limit: limit,
      }),
    )
    const rows = result.slice(0, limit)
    const hasMore = result.length > rows.length
    const last = rows.at(-1)
    return parseDatabaseValue(
      {
        items: rows,
        next_cursor:
          hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
      },
      roadmapPageSchema,
      'roadmap page',
    )
  },

  async vote(feedbackId: string, userId: string, hasVoted: boolean) {
    const client = createClient()
    if (hasVoted) {
      const { error } = await client
        .from(TABLES.FEEDBACK_VOTES)
        .delete()
        .eq('feedback_id', feedbackId)
        .eq('user_id', userId)
      unwrapSupabaseVoid({ error })
      return
    }
    const { error } = await client.from(TABLES.FEEDBACK_VOTES).insert({
      feedback_id: feedbackId,
      user_id: userId,
    })
    unwrapSupabaseVoid({ error })
  },
}
