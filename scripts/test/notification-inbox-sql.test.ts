// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createScalingFixture } from '../lib/scaling-fixture'

const user = '51111111-1111-4111-8111-111111111111'
const other = '52222222-2222-4222-8222-222222222222'
const second = '53333333-3333-4333-8333-333333333333'
let db: PGlite
type Page = {
  items: {
    id: string
    kind: string
    business_id: string
    read_at: string | null
  }[]
  snapshot: string
  next_cursor: string | null
}
beforeAll(async () => {
  db = await createScalingFixture()
  await db.exec(`CREATE TABLE report_export_jobs(id uuid PRIMARY KEY,user_id uuid,business_id uuid,status text);
    GRANT SELECT ON profiles TO authenticated;`)
  await db.exec(
    readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20261103010000_export_inbox_events.sql',
      ),
      'utf8',
    ),
  )
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE notification_inbox,notification_jobs,notification_scheduler_runs,report_export_jobs,cheques,businesses,profiles CASCADE;
    INSERT INTO profiles(user_id,voice_call_enabled,phone) VALUES('${user}',false,NULL),('${other}',false,NULL);
    INSERT INTO businesses(id,user_id) VALUES('${user}','${user}'),('${other}','${other}'),('${second}','${user}');
    INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
      SELECT '${user}','${user}','cheque_reminder','seed:'||i FROM generate_series(1,60) i;
    INSERT INTO notification_inbox(user_id,business_id,kind,event_key) VALUES
      ('${other}','${other}','export_ready','other'),('${user}','${second}','export_failed','second');
    SELECT set_config('request.jwt.claim.sub','${user}',false);
    SET ROLE authenticated;`)
})
afterAll(async () => {
  await db.close()
})
async function page(args = '') {
  return (
    await db.query<{ data: Page }>(
      `SELECT list_notification_inbox(${args}) AS data`,
    )
  ).rows[0].data
}
async function count() {
  return Number(
    (
      await db.query<{ count: number }>(
        'SELECT count_unread_notifications() AS count',
      )
    ).rows[0].count,
  )
}
describe('notification inbox ownership and lifecycle', () => {
  it('returns 50 items and a stable snapshot with no overlap across pages', async () => {
    const first = await page()
    expect(first.items).toHaveLength(50)
    expect(first.next_cursor).toBeTruthy()
    const next = await page(
      `requested_before:=${first.next_cursor},requested_snapshot:=${first.snapshot}`,
    )
    expect(next.items).toHaveLength(11)
    expect(next.next_cursor).toBeNull()
    expect(
      new Set([...first.items, ...next.items].map((item) => item.id)).size,
    ).toBe(61)
    expect(await count()).toBe(61)
  })
  it('does not mark anything read by viewing the inbox', async () => {
    await page()
    expect(await count()).toBe(61)
  })
  it('marks only the chosen business snapshot and leaves newer arrivals unread', async () => {
    const first = await page(`requested_business:='${user}'`)
    await db.exec(`RESET ROLE;
      INSERT INTO notification_inbox(user_id,business_id,kind,event_key) VALUES('${user}','${user}','export_ready','new');
      SET ROLE authenticated;`)
    await db.query(
      `SELECT mark_notifications_read(requested_snapshot:=${first.snapshot},requested_business:='${user}')`,
    )
    expect(await count()).toBe(2)
    expect((await page('requested_unread:=true')).items).toHaveLength(2)
  })
  it('rejects cross-user reads and writes and unauthenticated callers', async () => {
    await expect(
      db.query(
        `SELECT mark_notifications_read(requested_id:=(SELECT id FROM notification_inbox WHERE event_key='other'))`,
      ),
    ).rejects.toThrow()
    await expect(
      db.exec(`UPDATE notification_inbox SET read_at=now()`),
    ).rejects.toThrow()
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false)`)
    await expect(page()).rejects.toThrow(/Authentication/)
  })
  it('marks individual reads idempotently', async () => {
    const first = await page()
    await db.query(
      `SELECT mark_notifications_read(requested_id:=${first.items[0].id})`,
    )
    await db.query(
      `SELECT mark_notifications_read(requested_id:=${first.items[0].id})`,
    )
    expect(await count()).toBe(60)
  })
  it('hides deleted businesses and deactivated users', async () => {
    await db.exec(
      `RESET ROLE; UPDATE businesses SET deleted_at=now() WHERE id='${user}'; SET ROLE authenticated`,
    )
    expect(await count()).toBe(1)
    await db.exec(
      `RESET ROLE; UPDATE profiles SET deleted_at=now() WHERE user_id='${user}'; SET ROLE authenticated`,
    )
    await expect(page()).rejects.toThrow(/Authentication/)
  })
  it('excludes history older than 90 days and purges it in bounded scheduler batches', async () => {
    await db.exec(
      `RESET ROLE; UPDATE notification_inbox SET created_at=now()-interval '91 days'; SET ROLE authenticated`,
    )
    expect(await count()).toBe(0)
    expect((await page()).items).toHaveLength(0)
    await db.exec(
      `RESET ROLE; SELECT schedule_notification_batch('2026-10-31T03:30:00Z')`,
    )
    expect(
      (await db.query('SELECT id FROM notification_inbox')).rows,
    ).toHaveLength(0)
  })
  it('creates idempotent scheduled reminders without voice consent or a phone', async () => {
    await db.exec(`RESET ROLE;
      INSERT INTO cheques(id,business_id,cheque_number,amount) VALUES(gen_random_uuid(),'${user}','123456',1);
      SELECT schedule_notification_batch('2026-10-31T03:30:00Z');
      SELECT schedule_notification_batch('2026-10-31T03:40:00Z');`)
    expect(
      (
        await db.query(
          `SELECT id FROM notification_inbox WHERE event_key LIKE 'cheque_reminder:%'`,
        )
      ).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT id FROM notification_jobs')).rows,
    ).toHaveLength(0)
  })
  it('emits export ready/failed transitions once and does not copy provider data', async () => {
    await db.exec(`RESET ROLE; INSERT INTO report_export_jobs VALUES('${user}','${user}','${user}','processing');
      UPDATE report_export_jobs SET status='ready'; UPDATE report_export_jobs SET status='ready';
      UPDATE report_export_jobs SET status='failed'; UPDATE report_export_jobs SET status='ready';`)
    expect(
      (
        await db.query(
          `SELECT kind FROM notification_inbox WHERE event_key LIKE 'export:%' ORDER BY id`,
        )
      ).rows,
    ).toEqual([{ kind: 'export_ready' }, { kind: 'export_failed' }])
    const fields = (
      await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name='notification_inbox'`,
      )
    ).rows.map((r) => r.column_name)
    expect(fields).not.toContain('payload')
    expect(fields).not.toContain('recipient')
  })
  it('rejects ambiguous and negative mutation cursors', async () => {
    await expect(db.query('SELECT mark_notifications_read()')).rejects.toThrow()
    await expect(
      db.query('SELECT mark_notifications_read(requested_snapshot:=-1)'),
    ).rejects.toThrow()
    await expect(page('requested_before:=-1')).rejects.toThrow()
  })
})
