// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const userA = '10000000-0000-4000-8000-000000000101'
const userB = '10000000-0000-4000-8000-000000000102'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb(['20261106020000_feedback_roadmap.sql'])
  await db.exec(`
    INSERT INTO auth.users(id, email)
    VALUES ('${userA}', 'feedback-a@test.invalid'), ('${userB}', 'feedback-b@test.invalid');
    REVOKE ALL ON feedback_items, feedback_votes FROM authenticated;
    GRANT SELECT, INSERT ON feedback_items TO authenticated;
    GRANT SELECT, INSERT, DELETE ON feedback_votes TO authenticated;
  `)
}, 60000)

afterAll(async () => {
  await db?.close()
})

async function asService<T>(sql: string) {
  await db.exec('SET ROLE service_role')
  try {
    return await db.query<T>(sql)
  } finally {
    await db.exec('RESET ROLE')
  }
}

describe('private feedback and published roadmap', () => {
  it('creates indexes for owner, admin, status, roadmap, and vote pagination', async () => {
    const indexes = await db.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'feedback_items_user_created_idx',
          'feedback_items_admin_created_idx',
          'feedback_items_status_created_idx',
          'feedback_items_roadmap_created_idx',
          'feedback_votes_user_idx'
        )
    `)
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual(
      [
        'feedback_items_admin_created_idx',
        'feedback_items_roadmap_created_idx',
        'feedback_items_status_created_idx',
        'feedback_items_user_created_idx',
        'feedback_votes_user_idx',
      ].sort(),
    )
  })

  it('keeps submissions private until an admin publishes feature requests', async () => {
    const feature = await asUser<{ id: string }>(
      db,
      userA,
      `INSERT INTO feedback_items(category,title,description)
       VALUES ('feature','Bulk cheque labels','Please add reusable labels to cheque lists.')
       RETURNING id`,
    )
    const bug = await asUser<{ id: string }>(
      db,
      userA,
      `INSERT INTO feedback_items(category,title,description)
       VALUES ('bug','Search resets','Searching twice clears the current result.')
       RETURNING id`,
    )
    expect(
      (await asUser<{ id: string }>(db, userB, 'SELECT id FROM feedback_items'))
        .rows,
    ).toEqual([])
    expect(
      (
        await asUser<{ id: string; category: string }>(
          db,
          userA,
          `SELECT id, category FROM feedback_items ORDER BY category`,
        )
      ).rows,
    ).toHaveLength(2)
    expect(
      (
        await asUser<{ id: string }>(
          db,
          userB,
          'SELECT id FROM list_feedback_roadmap(NULL, NULL, 25)',
        )
      ).rows,
    ).toEqual([])
    expect(
      (
        await asUser<{ id: string }>(
          db,
          userB,
          'SELECT id FROM list_my_feedback(NULL, NULL, 25)',
        )
      ).rows,
    ).toEqual([])

    await asService(
      `SELECT admin_update_feedback(
        '${feature.rows[0].id}', 'planned', TRUE, 'operator@test.invalid', 'approved for roadmap'
      )`,
    )
    const publicRows = await asUser<{
      id: string
      status: string
      vote_count: number
    }>(
      db,
      userB,
      'SELECT id, status, vote_count FROM list_feedback_roadmap(NULL, NULL, 25)',
    )
    expect(publicRows.rows).toContainEqual({
      id: feature.rows[0].id,
      status: 'planned',
      vote_count: 0,
    })
    expect(
      (
        await asUser<{ id: string }>(
          db,
          userB,
          `SELECT id FROM feedback_items WHERE id='${feature.rows[0].id}'`,
        )
      ).rows,
    ).toEqual([{ id: feature.rows[0].id }])
    expect(
      (
        await asUser<{ id: string }>(
          db,
          userB,
          `SELECT id FROM feedback_items WHERE category <> 'feature'`,
        )
      ).rows,
    ).toEqual([])

    await expect(
      asService(
        `SELECT admin_update_feedback(
          '${bug.rows[0].id}', 'declined', TRUE, 'operator@test.invalid', NULL
        )`,
      ),
    ).rejects.toThrow(/Only feature requests/)
    expect(
      (
        await asService<{ count: number }>(
          `SELECT count(*)::int AS count FROM admin_audit_log
           WHERE action = 'feedback.update' AND target_id = '${feature.rows[0].id}'`,
        )
      ).rows[0].count,
    ).toBe(1)
  })

  it('enforces a single vote per user and maintains bounded page counts', async () => {
    const feature = await asUser<{ id: string }>(
      db,
      userA,
      `INSERT INTO feedback_items(category,title,description)
       VALUES ('feature','Account reminders','Allow separate reminder defaults for each bank account.')
       RETURNING id`,
    )
    await asService(
      `SELECT admin_update_feedback(
        '${feature.rows[0].id}', 'in_progress', TRUE, 'operator@test.invalid', NULL
      )`,
    )

    await asUser(
      db,
      userB,
      `INSERT INTO feedback_votes(feedback_id) VALUES ('${feature.rows[0].id}')`,
    )
    await expect(
      asUser(
        db,
        userB,
        `INSERT INTO feedback_votes(feedback_id) VALUES ('${feature.rows[0].id}')`,
      ),
    ).rejects.toThrow(/duplicate key/)
    const afterVote = await asUser<{
      id: string
      vote_count: number
      has_voted: boolean
    }>(
      db,
      userB,
      'SELECT id, vote_count, has_voted FROM list_feedback_roadmap(NULL, NULL, 25)',
    )
    expect(afterVote.rows.find((row) => row.id === feature.rows[0].id)).toEqual(
      { id: feature.rows[0].id, vote_count: 1, has_voted: true },
    )

    await asUser(
      db,
      userB,
      `DELETE FROM feedback_votes WHERE feedback_id = '${feature.rows[0].id}'`,
    )
    expect(
      (
        await asService<{ vote_count: number }>(
          `SELECT vote_count FROM feedback_items WHERE id = '${feature.rows[0].id}'`,
        )
      ).rows[0].vote_count,
    ).toBe(0)
    await expect(
      asUser(db, userB, 'SELECT * FROM list_feedback_roadmap(NULL, NULL, 51)'),
    ).rejects.toThrow(/Invalid roadmap page request/)
  })

  it('rejects user status changes, hidden-item votes, and direct admin operations', async () => {
    const feature = await asUser<{ id: string }>(
      db,
      userA,
      `INSERT INTO feedback_items(category,title,description)
       VALUES ('feature','Private feature','Keep this request hidden until an administrator publishes it.')
       RETURNING id`,
    )
    await expect(
      asUser(
        db,
        userA,
        `UPDATE feedback_items SET status='shipped' WHERE id='${feature.rows[0].id}'`,
      ),
    ).rejects.toThrow(/policy|permission/i)
    await expect(
      asUser(
        db,
        userB,
        `INSERT INTO feedback_votes(feedback_id) VALUES ('${feature.rows[0].id}')`,
      ),
    ).rejects.toThrow(/policy|permission/i)
    await expect(
      asUser(
        db,
        userA,
        `SELECT admin_update_feedback(
          '${feature.rows[0].id}', 'planned', TRUE, 'user@test.invalid', NULL
        )`,
      ),
    ).rejects.toThrow(/permission/i)
  })

  it('limits each user to five successful submissions in a rolling hour window', async () => {
    const rateUser = '10000000-0000-4000-8000-000000000103'
    await db.exec(
      `INSERT INTO auth.users(id,email) VALUES ('${rateUser}','rate@test.invalid')`,
    )
    for (let index = 1; index <= 5; index += 1) {
      await asUser(
        db,
        rateUser,
        `INSERT INTO feedback_items(category,title,description)
         VALUES ('other','Feedback ${index}','A distinct note for this test submission.')`,
      )
    }
    await expect(
      asUser(
        db,
        rateUser,
        `INSERT INTO feedback_items(category,title,description)
         VALUES ('other','Feedback six','A sixth note should be rate limited.')`,
      ),
    ).rejects.toThrow(/Feedback submission limit reached/)
    expect(
      (
        await asService<{ count: number }>(
          `SELECT count(*)::int AS count FROM feedback_items WHERE user_id='${rateUser}'`,
        )
      ).rows[0].count,
    ).toBe(5)
  })
})
