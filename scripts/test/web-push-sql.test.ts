// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createScalingFixture } from '../lib/scaling-fixture'

const user = '51111111-1111-4111-8111-111111111111'
const other = '52222222-2222-4222-8222-222222222222'
const key = 'B' + 'A'.repeat(86)
const auth = 'A'.repeat(22)
const endpoint = 'https://fcm.googleapis.com/fcm/send/device'
let db: PGlite
type Job = { id: string; claim_token: string; status: string }
beforeAll(async () => {
  db = await createScalingFixture()
  await db.exec(
    'ALTER TABLE profiles ADD COLUMN push_enabled boolean DEFAULT false',
  )
  for (const file of [
    '20261031050000_notification_provider_capacity.sql',
    '20261103015000_inbox_push_purpose.sql',
    '20261103020000_web_push.sql',
  ])
    await db.exec(
      readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8'),
    )
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE notification_provider_slots,notification_attempts,notification_logs,notification_jobs,notification_inbox,push_subscriptions,notification_scheduler_runs,cheques,businesses,profiles CASCADE;
    UPDATE notification_provider_capacity SET next_start_at='-infinity',max_in_flight=10 WHERE provider='web_push';
    INSERT INTO profiles(user_id,voice_call_enabled,phone) VALUES('${user}',false,NULL),('${other}',false,NULL);
    INSERT INTO businesses(id,user_id) VALUES('${user}','${user}'),('${other}','${other}');
    SELECT set_config('request.jwt.claim.sub','${user}',false);
    SET ROLE authenticated;`)
})
afterAll(async () => {
  await db.close()
})
async function register(url = endpoint) {
  return (
    await db.query<{ id: string }>(
      'SELECT register_push_subscription($1,$2,$3) AS id',
      [url, key, auth],
    )
  ).rows[0].id
}
async function emit() {
  await db.exec(`RESET ROLE;
    INSERT INTO notification_inbox(user_id,business_id,kind,event_key) VALUES('${user}','${user}','export_ready',gen_random_uuid()::text);
    SELECT set_config('request.jwt.claim.role','service_role',false);`)
  return (await db.query<Job>('SELECT * FROM claim_notification_jobs(10)')).rows
}
async function admit(job: Job) {
  return (
    await db.query<{ data: { status: string } }>(
      'SELECT admit_push_delivery($1,$2) AS data',
      [job.id, job.claim_token],
    )
  ).rows[0].data
}
async function finish(job: Job, outcome: string, status: number | null) {
  await db.query('SELECT finish_push_delivery($1,$2,$3,$4)', [
    job.id,
    job.claim_token,
    outcome,
    status,
  ])
}
describe('secure free multi-device Web Push queue', () => {
  it('registers idempotently, opts in and hides endpoint/key rows from clients', async () => {
    expect(await register()).toBe(await register())
    expect(
      (
        await db.query<{ own: boolean }>(
          'SELECT owns_push_subscription($1) AS own',
          [endpoint],
        )
      ).rows[0].own,
    ).toBe(true)
    await expect(db.query('SELECT * FROM push_subscriptions')).rejects.toThrow(
      /permission/,
    )
    await db.exec('RESET ROLE')
    expect(
      (
        await db.query<{ push_enabled: boolean }>(
          'SELECT push_enabled FROM profiles WHERE user_id=$1',
          [user],
        )
      ).rows[0].push_enabled,
    ).toBe(true)
  })
  it('rejects cross-account transfer and deletion', async () => {
    await register()
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false)`)
    await expect(register()).rejects.toThrow(/another account/)
    await db.query('SELECT remove_push_subscription($1)', [endpoint])
    await db.exec('RESET ROLE')
    expect(
      (await db.query('SELECT id FROM push_subscriptions')).rows,
    ).toHaveLength(1)
  })
  it('enforces exactly 10 devices, allows existing-device updates at the cap', async () => {
    for (let i = 0; i < 10; i++) await register(endpoint + i)
    await expect(register(endpoint + '10')).rejects.toThrow(/10 push devices/)
    await expect(register(endpoint + '0')).resolves.toBeTruthy()
  })
  it.each([
    'http://fcm.googleapis.com/a',
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com.evil.test/a',
    'https://fcm.googleapis.com@evil.test/a',
    'https://fcm.googleapis.com:8443/a',
  ])('rejects SSRF endpoint %s', async (url) => {
    await expect(register(url)).rejects.toThrow(/Invalid push/)
  })
  it('queues one job per device but only one inbox event and uses no voice quota', async () => {
    await register()
    await register(endpoint + '2')
    const jobs = await emit()
    expect(jobs).toHaveLength(2)
    expect(
      (await db.query('SELECT id FROM notification_inbox')).rows,
    ).toHaveLength(1)
    expect((await db.query('SELECT id FROM user_quotas')).rows).toHaveLength(0)
    expect((await admit(jobs[0])).status).toBe('started')
    await finish(jobs[0], 'accepted', 201)
    await finish(jobs[0], 'accepted', 201)
    expect(
      (await db.query('SELECT id FROM notification_logs')).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT claim_token FROM notification_provider_slots'))
        .rows,
    ).toHaveLength(0)
  })
  it('paces across independent claims and requeues without consuming retry attempts', async () => {
    await register()
    await register(endpoint + '2')
    const jobs = await emit()
    expect((await admit(jobs[0])).status).toBe('started')
    expect((await admit(jobs[1])).status).toBe('throttled')
    const result = (
      await db.query<{ status: string; attempts: number }>(
        'SELECT status,attempts FROM notification_jobs WHERE id=$1',
        [jobs[1].id],
      )
    ).rows[0]
    expect(result).toEqual({ status: 'pending', attempts: 0 })
  })
  it.each([404, 410])(
    'HTTP %s removes stale subscriptions and cancels their remaining jobs',
    async (status) => {
      await register()
      const jobs = await emit()
      await admit(jobs[0])
      await finish(jobs[0], 'rejected', status)
      expect(
        (await db.query('SELECT id FROM push_subscriptions')).rows,
      ).toHaveLength(0)
      expect(
        (
          await db.query<{ status: string }>(
            'SELECT status FROM notification_jobs',
          )
        ).rows[0].status,
      ).toBe('skipped')
    },
  )
  it('retries explicit 503 rejection but retains uncertain delivery for reconciliation', async () => {
    await register()
    let jobs = await emit()
    await admit(jobs[0])
    await finish(jobs[0], 'rejected', 503)
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs WHERE id=$1',
          [jobs[0].id],
        )
      ).rows[0].status,
    ).toBe('pending')
    await db.exec(
      "UPDATE notification_provider_capacity SET next_start_at='-infinity'",
    )
    jobs = await emit()
    await admit(jobs[0])
    await finish(jobs[0], 'uncertain', null)
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs WHERE id=$1',
          [jobs[0].id],
        )
      ).rows[0].status,
    ).toBe('failed')
    expect(
      (await db.query('SELECT claim_token FROM notification_provider_slots'))
        .rows,
    ).toHaveLength(1)
  })
  it('deactivation removes devices and cancels pending pushes', async () => {
    await register()
    await emit()
    await db.exec(
      `UPDATE profiles SET deleted_at=now() WHERE user_id='${user}'`,
    )
    expect(
      (await db.query('SELECT id FROM push_subscriptions')).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs',
        )
      ).rows[0].status,
    ).toBe('cancelled')
  })
  it('rechecks global opt-out before admission and skips without a provider request', async () => {
    await register()
    const jobs = await emit()
    await db.exec(
      `UPDATE profiles SET push_enabled=false WHERE user_id='${user}'`,
    )
    expect((await admit(jobs[0])).status).toBe('skipped')
    expect(
      (await db.query('SELECT claim_token FROM notification_attempts')).rows,
    ).toHaveLength(0)
  })
})
