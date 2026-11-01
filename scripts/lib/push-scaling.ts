import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { performance } from 'node:perf_hooks'

export async function benchmarkPush(
  db: PGlite,
  hotUser: string,
  samples: number,
) {
  const quotaBefore = (
    await db.query<{ used: number }>(
      'SELECT sum(used)::int AS used FROM user_quotas',
    )
  ).rows[0].used
  await db.exec(
    'RESET ROLE; ALTER TABLE profiles ADD COLUMN push_enabled boolean DEFAULT true',
  )
  for (const file of [
    '20261031050000_notification_provider_capacity.sql',
    '20261103015000_inbox_push_purpose.sql',
    '20261103020000_web_push.sql',
  ])
    await db.exec(
      readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8'),
    )
  const key = 'B' + 'A'.repeat(86)
  const auth = 'A'.repeat(22)
  await db.query(
    `INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth)
    SELECT user_id,'https://fcm.googleapis.com/fcm/send/'||user_id,$1,$2 FROM profiles WHERE voice_call_enabled`,
    [key, auth],
  )
  await db.exec('ANALYZE push_subscriptions')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    hotUser,
  ])
  await db.exec('SET ROLE authenticated')
  const timings: number[] = []
  for (let i = 0; i < samples; i++) {
    const started = performance.now()
    const result = await db.query<{ id: string }>(
      'SELECT register_push_subscription($1,$2,$3) AS id',
      ['https://fcm.googleapis.com/fcm/send/' + hotUser, key, auth],
    )
    assert(result.rows[0].id)
    const own = await db.query<{ own: boolean }>(
      'SELECT owns_push_subscription($1) AS own',
      ['https://fcm.googleapis.com/fcm/send/' + hotUser],
    )
    assert.equal(own.rows[0].own, true)
    timings.push(performance.now() - started)
  }
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false);
    INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
      SELECT user_id,user_id,'export_ready','benchmark-push:'||user_id FROM profiles WHERE voice_call_enabled;`)
  const queued = Number(
    (
      await db.query<{ count: number }>(
        "SELECT count(*) AS count FROM notification_jobs WHERE channel='push'",
      )
    ).rows[0].count,
  )
  const jobs = (
    await db.query<{ id: string; claim_token: string }>(
      `SELECT * FROM claim_notification_jobs(1,p_job_ids:=ARRAY(SELECT id FROM notification_jobs WHERE channel='push' AND user_id=$1),p_user_id:=$1)`,
      [hotUser],
    )
  ).rows
  assert.equal(jobs.length, 1)
  const admission = (
    await db.query<{ data: { status: string } }>(
      'SELECT admit_push_delivery($1,$2) AS data',
      [jobs[0].id, jobs[0].claim_token],
    )
  ).rows[0].data
  assert.equal(admission.status, 'started')
  await db.query("SELECT finish_push_delivery($1,$2,'accepted',201)", [
    jobs[0].id,
    jobs[0].claim_token,
  ])
  const quota = (
    await db.query<{ used: number }>(
      'SELECT sum(used)::int AS used FROM user_quotas',
    )
  ).rows[0]
  assert.equal(quota.used, quotaBefore, 'Push does not consume voice quota')
  return { timings, queued, simulated_accepted: 1, quota_independent: true }
}
