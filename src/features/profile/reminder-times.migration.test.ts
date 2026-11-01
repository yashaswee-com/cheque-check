// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const one = '10000000-0000-0000-0000-0000000000e1'
const three = '10000000-0000-0000-0000-0000000000e2'
const later = '10000000-0000-0000-0000-0000000000e3'
let db: PGlite

const times = async (user: string) =>
  (
    await db.query<{ reminder_times: string[]; reminders_per_day: number }>(
      `SELECT reminder_times::text[] AS reminder_times, reminders_per_day FROM profiles WHERE user_id = '${user}'`,
    )
  ).rows[0]

beforeAll(async () => {
  db = await createMigratedDb([
    '20261031010000_notification_delivery_leases.sql',
    '20261031020000_bounded_notification_scheduler.sql',
    '20261101060000_published_default_accounts.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${one}','one@x.test'),('${three}','three@x.test');
    UPDATE profiles SET reminders_per_day = 3 WHERE user_id = '${three}';
  `)
  // Existing profiles must be backfilled when the migration runs.
  await db.exec(migration('20261101120000_reminder_times.sql'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('reminder_times migration on the full schema', () => {
  it('backfills existing profiles from their reminder count', async () => {
    expect(await times(one)).toEqual({
      reminder_times: ['09:00:00'],
      reminders_per_day: 1,
    })
    expect(await times(three)).toEqual({
      reminder_times: ['09:00:00', '13:00:00', '18:00:00'],
      reminders_per_day: 3,
    })
  })

  it('gives profiles created after the migration the default time', async () => {
    await db.exec(
      `INSERT INTO auth.users(id,email) VALUES('${later}','later@x.test')`,
    )
    expect(await times(later)).toEqual({
      reminder_times: ['09:00:00'],
      reminders_per_day: 1,
    })
  })

  it('lets users save their own times through RLS', async () => {
    await asUser(
      db,
      one,
      `UPDATE profiles SET reminder_times = '{08:15,12:00,21:45}' WHERE user_id = '${one}'`,
    )
    expect(await times(one)).toEqual({
      reminder_times: ['08:15:00', '12:00:00', '21:45:00'],
      reminders_per_day: 3,
    })
  })
})
