import { performance } from 'node:perf_hooks'
import { asUser, createMigratedDb } from '../../src/test/migrated-db'

export interface FeedbackScalingOptions {
  users?: number
  iterations?: number
}

export interface FeedbackScalingResult {
  users: number
  feedbackItems: number
  votes: number
  requestedPageSize: number
  returnedRows: number
  p95Milliseconds: number
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ]
}

/** Seeds a realistic local fixture and measures the bounded roadmap RPC at 10k scale. */
export async function runFeedbackScaling({
  users = 10_000,
  iterations = 30,
}: FeedbackScalingOptions = {}): Promise<FeedbackScalingResult> {
  if (!Number.isInteger(users) || users < 1 || users > 100_000)
    throw new RangeError('users must be an integer between 1 and 100000')
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 200)
    throw new RangeError('iterations must be an integer between 1 and 200')

  const db = await createMigratedDb(['20261106020000_feedback_roadmap.sql'])
  try {
    await db.exec(`
      INSERT INTO auth.users(id, email)
      SELECT gen_random_uuid(), 'feedback-scale-' || sequence || '@test.invalid'
      FROM generate_series(1, ${users}) AS series(sequence);
      ALTER TABLE public.feedback_items DISABLE TRIGGER feedback_items_submission_limit;
      INSERT INTO public.feedback_items(user_id, category, title, description, status, roadmap_published)
      SELECT id, 'feature', 'Roadmap request ' || row_number,
        'Performance fixture for a published roadmap request.',
        'planned', TRUE
      FROM (
        SELECT id, row_number() OVER (ORDER BY id) AS row_number
        FROM auth.users
        WHERE email LIKE 'feedback-scale-%@test.invalid'
      ) users;
      ALTER TABLE public.feedback_items ENABLE TRIGGER feedback_items_submission_limit;
      INSERT INTO public.feedback_votes(feedback_id, user_id)
      SELECT item.id, item.user_id
      FROM public.feedback_items item
      JOIN auth.users user_row ON user_row.id = item.user_id
      WHERE user_row.email LIKE 'feedback-scale-%@test.invalid';
    `)

    const firstUser = await db.query<{ id: string }>(
      `SELECT id FROM auth.users WHERE email LIKE 'feedback-scale-%@test.invalid' ORDER BY id LIMIT 1`,
    )
    const userId = firstUser.rows[0]?.id
    if (!userId) throw new Error('Failed to seed a feedback scaling user')
    const expectedRows = Math.min(users, 26)

    const readPage = () =>
      asUser<{
        id: string
        vote_count: number
      }>(
        db,
        userId,
        'SELECT id, vote_count FROM list_feedback_roadmap(NULL, NULL, 25)',
      )
    const warmup = await readPage()
    if (warmup.rows.length !== expectedRows)
      throw new Error(
        `Expected ${expectedRows} bounded rows, got ${warmup.rows.length}`,
      )

    const timings: number[] = []
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now()
      const page = await readPage()
      timings.push(performance.now() - start)
      if (page.rows.length !== expectedRows)
        throw new Error(`Unexpected roadmap page size ${page.rows.length}`)
    }

    const counts = await db.query<{
      feedback_items: number
      votes: number
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.feedback_items) AS feedback_items,
        (SELECT count(*)::int FROM public.feedback_votes) AS votes
    `)
    return {
      users,
      feedbackItems: counts.rows[0].feedback_items,
      votes: counts.rows[0].votes,
      requestedPageSize: 25,
      returnedRows: warmup.rows.length,
      p95Milliseconds: percentile(timings, 0.95),
    }
  } finally {
    await db.close()
  }
}
