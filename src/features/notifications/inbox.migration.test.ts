// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'
import {
  inboxListSchema,
  inboxPageSchema,
} from '@/validators/notification-inbox'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const business = '20000000-0000-4000-8000-000000000001'
const second = '20000000-0000-4000-8000-000000000002'
let db: PGlite
beforeAll(async () => {
  db = await createMigratedDb([
    '20261031010000_notification_delivery_leases.sql',
    '20261031020000_bounded_notification_scheduler.sql',
    '20261101120000_reminder_times.sql',
    '20261103000000_notification_inbox.sql',
    '20261031050000_notification_provider_capacity.sql',
    '20261103015000_inbox_push_purpose.sql',
    '20261103020000_web_push.sql',
    '20261109000000_notification_inbox_pages.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','inbox@x.test'),('${other}','other@x.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Business');
    INSERT INTO notification_inbox(user_id,business_id,kind,event_key) VALUES('${owner}','${business}','export_ready','test');
  `)
}, 60000)
afterAll(async () => {
  await db?.close()
})
describe('inbox migration on the full schema', () => {
  it('returns the validated JSON contract and restricts other tenants', async () => {
    const own = await asUser<{ data: unknown }>(
      db,
      owner,
      'SELECT list_notification_inbox() AS data',
    )
    expect(inboxPageSchema.parse(own.rows[0].data).items).toHaveLength(1)
    const foreign = await asUser<{ data: unknown }>(
      db,
      other,
      'SELECT list_notification_inbox() AS data',
    )
    expect(inboxPageSchema.parse(foreign.rows[0].data).items).toHaveLength(0)
  })
  it('pages with a total, sorts both ways and matches search kinds or businesses', async () => {
    await db.exec(`
      INSERT INTO businesses(id,user_id,name) VALUES('${second}','${owner}','Second');
      INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
        SELECT '${owner}','${second}','cheque_reminder','page:'||i FROM generate_series(1,55) i;`)
    const list = async (args: string, user = owner) =>
      inboxListSchema.parse(
        (
          await asUser<{ data: unknown }>(
            db,
            user,
            `SELECT list_notification_inbox_page(${args}) AS data`,
          )
        ).rows[0].data,
      )
    const first = await list('')
    expect(first.total).toBe(56)
    expect(first.items).toHaveLength(50)
    expect(first.items[0].kind).toBe('cheque_reminder')
    // New events after the snapshot never shift later pages.
    await db.exec(`INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
      VALUES('${owner}','${business}','export_ready','late')`)
    const second_page = await list(
      `requested_page:=1,requested_snapshot:=${first.snapshot}`,
    )
    expect(second_page.total).toBe(56)
    expect(second_page.items).toHaveLength(6)
    expect(second_page.items.at(-1)?.kind).toBe('export_ready')
    const oldest = await list('requested_ascending:=true')
    expect(oldest.total).toBe(57)
    expect(Number(oldest.items[0].id)).toBeLessThan(Number(oldest.items[1].id))
    const byKind = await list("requested_match_kinds:=ARRAY['export_ready']")
    expect(byKind.total).toBe(2)
    const byBusiness = await list(
      `requested_match_kinds:=ARRAY[]::text[],requested_match_businesses:=ARRAY['${business}']::uuid[]`,
    )
    expect(byBusiness.total).toBe(2)
    const nothing = await list(
      'requested_match_kinds:=ARRAY[]::text[],requested_match_businesses:=ARRAY[]::uuid[]',
    )
    expect(nothing.total).toBe(0)
    const scoped = await list(
      `requested_business:='${second}',requested_unread:=true`,
    )
    expect(scoped.total).toBe(55)
    expect((await list('', other)).total).toBe(0)
    await expect(list('requested_page:=200')).rejects.toThrow(/Invalid/)
    await expect(list('requested_page:=-1')).rejects.toThrow(/Invalid/)
  })
  it('enforces RLS even when a fixture grants broad table access', async () => {
    const result = await asUser(
      db,
      other,
      'UPDATE notification_inbox SET read_at=now() RETURNING id',
    )
    expect(result.rows).toHaveLength(0)
    const id = (
      await db.query<{ id: string }>('SELECT id FROM notification_inbox')
    ).rows[0].id
    await expect(
      asUser(db, other, `SELECT mark_notifications_read(requested_id:=${id})`),
    ).rejects.toThrow(/unavailable/)
  })
  it('registers and queues Web Push on real schema types without touching voice quotas', async () => {
    // Restore the production access boundary after the fixture's blanket grant.
    await db.exec('REVOKE ALL ON push_subscriptions FROM authenticated')
    await asUser(
      db,
      owner,
      `SELECT register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/full-schema','B${'A'.repeat(86)}','${'A'.repeat(22)}')`,
    )
    await db.exec(`INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
      VALUES('${owner}','${business}','export_failed','push-test')`)
    expect(
      (
        await db.query<{ channel: string; purpose: string }>(
          `SELECT channel,purpose FROM notification_jobs WHERE channel='push'`,
        )
      ).rows,
    ).toEqual([{ channel: 'push', purpose: 'inbox_event' }])
    await expect(
      asUser(db, owner, 'SELECT endpoint FROM push_subscriptions'),
    ).rejects.toThrow(/permission/)
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','service_role',false)",
    )
    const job = (
      await db.query<{ id: string; claim_token: string }>(
        'SELECT * FROM claim_notification_jobs(1)',
      )
    ).rows[0]
    expect(
      (
        await db.query<{ data: { status: string } }>(
          'SELECT admit_push_delivery($1,$2) AS data',
          [job.id, job.claim_token],
        )
      ).rows[0].data.status,
    ).toBe('started')
    await db.query("SELECT finish_push_delivery($1,$2,'accepted',201)", [
      job.id,
      job.claim_token,
    ])
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs WHERE id=$1',
          [job.id],
        )
      ).rows[0].status,
    ).toBe('sent')
  })
})
