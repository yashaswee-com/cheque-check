// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMigratedDb, asUser, migration } from '@/test/migrated-db'
describe('durable per-user tour eligibility', () => {
  it('opts existing users out, defaults new users to pending, and isolates completion/replay', async () => {
    const db = await createMigratedDb()
    const a = '10000000-0000-4000-8000-000000000001',
      b = '10000000-0000-4000-8000-000000000002'
    try {
      await db.exec(
        `INSERT INTO auth.users(id,email) VALUES('${a}','a@test.invalid')`,
      )
      await db.exec(migration('20261105020000_first_run_tour.sql'))
      await db.exec(
        `INSERT INTO auth.users(id,email) VALUES('${b}','b@test.invalid')`,
      )
      expect(
        (
          await asUser<{ tour_status: string }>(
            db,
            a,
            'SELECT tour_status FROM profiles',
          )
        ).rows[0].tour_status,
      ).toBe('skipped')
      expect(
        (
          await asUser<{ tour_status: string }>(
            db,
            b,
            'SELECT tour_status FROM profiles',
          )
        ).rows[0].tour_status,
      ).toBe('pending')
      await asUser(db, b, "UPDATE profiles SET tour_status='completed'")
      await asUser(db, a, "UPDATE profiles SET tour_status='pending'")
      expect(
        (
          await asUser<{ tour_status: string }>(
            db,
            b,
            'SELECT tour_status FROM profiles',
          )
        ).rows[0].tour_status,
      ).toBe('completed')
      await expect(
        asUser(db, b, "UPDATE profiles SET tour_status='invalid'"),
      ).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 60000)
})
