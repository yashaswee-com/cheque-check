// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createScalingFixture } from '../lib/scaling-fixture'

const user = '51111111-1111-4111-8111-111111111111'
let db: PGlite

beforeAll(async () => {
  db = await createScalingFixture()
}, 30_000)
beforeEach(async () => {
  await db.exec(`TRUNCATE notification_jobs, notification_scheduler_runs, cheques, businesses, profiles CASCADE;
    INSERT INTO profiles(user_id, reminder_times) VALUES('${user}', '{07:30,20:00}');
    INSERT INTO businesses(id,user_id) VALUES('${user}','${user}');
    INSERT INTO cheques(id,business_id,cheque_number,amount) VALUES(gen_random_uuid(),'${user}','123456',1);`)
})
afterAll(async () => {
  await db.close()
})

const times = async () =>
  (
    await db.query<{ reminder_times: string[]; reminders_per_day: number }>(
      `SELECT reminder_times::text[] AS reminder_times, reminders_per_day FROM profiles WHERE user_id = '${user}'`,
    )
  ).rows[0]

async function schedule(at: string) {
  await db.exec('UPDATE notification_scheduler_runs SET completed = true')
  const { rows } = await db.query<{ enqueued: number }>(
    'SELECT * FROM schedule_notification_batch($1)',
    [at],
  )
  return rows[0].enqueued
}

describe('user-chosen reminder times', () => {
  it('derives the count from explicit times', async () => {
    expect(await times()).toEqual({
      reminder_times: ['07:30:00', '20:00:00'],
      reminders_per_day: 2,
    })
  })

  it('calls only at the chosen local times, labelled by time', async () => {
    // Asia/Kolkata is UTC+05:30.
    expect(await schedule('2026-10-31T02:00:00Z')).toBe(1) // 07:30 IST
    expect(await schedule('2026-10-31T03:30:00Z')).toBe(0) // 09:00 IST (old default)
    expect(await schedule('2026-10-31T02:10:00Z')).toBe(0) // same 07:30 window, idempotent
    expect(await schedule('2026-10-31T14:30:00Z')).toBe(1) // 20:00 IST
    const { rows } = await db.query<{ idempotency_key: string; slot: string }>(
      "SELECT idempotency_key, payload->>'slot' AS slot FROM notification_jobs ORDER BY idempotency_key",
    )
    expect(rows.map((row) => row.slot)).toEqual(['07:30', '20:00'])
    expect(rows[0].idempotency_key).toMatch(/:2026-10-31:07:30$/)
  })

  it('force runs use the first chosen time', async () => {
    await db.exec('UPDATE notification_scheduler_runs SET completed = true')
    const { rows } = await db.query<{ enqueued: number }>(
      "SELECT * FROM schedule_notification_batch('2026-10-31T10:00:00Z', true)",
    )
    expect(rows[0].enqueued).toBe(1)
    expect(
      (
        await db.query<{ slot: string }>(
          "SELECT payload->>'slot' AS slot FROM notification_jobs",
        )
      ).rows,
    ).toEqual([{ slot: '07:30' }])
  })

  it('keeps chosen times when only the legacy count changes', async () => {
    await db.exec(
      `UPDATE profiles SET reminders_per_day = 3 WHERE user_id = '${user}'`,
    )
    expect(await times()).toEqual({
      reminder_times: ['07:30:00', '09:00:00', '20:00:00'],
      reminders_per_day: 3,
    })
    await db.exec(
      `UPDATE profiles SET reminders_per_day = 1 WHERE user_id = '${user}'`,
    )
    expect(await times()).toEqual({
      reminder_times: ['07:30:00'],
      reminders_per_day: 1,
    })
  })

  it('applies historical defaults to profiles created with only a count', async () => {
    const other = '52222222-2222-4222-8222-222222222222'
    await db.exec(
      `INSERT INTO profiles(user_id, reminders_per_day) VALUES('${other}', 2)`,
    )
    expect(
      (
        await db.query<{ reminder_times: string[] }>(
          `SELECT reminder_times::text[] AS reminder_times FROM profiles WHERE user_id = '${other}'`,
        )
      ).rows[0].reminder_times,
    ).toEqual(['09:00:00', '17:00:00'])
  })

  it.each([
    ['{}'],
    ['{09:00,10:00,11:00,12:00}'],
    ['{05:45}'],
    ['{22:15}'],
    ['{09:10}'],
    ['{10:00,09:00}'],
    ['{09:00,09:00}'],
  ])('rejects invalid reminder times %s', async (value) => {
    await expect(
      db.exec(
        `UPDATE profiles SET reminder_times = '${value}' WHERE user_id = '${user}'`,
      ),
    ).rejects.toThrow()
  })
})
