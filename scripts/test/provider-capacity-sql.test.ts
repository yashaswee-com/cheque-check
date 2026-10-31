// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { createScalingFixture } from '../lib/scaling-fixture'

let db: PGlite
const user = '11111111-1111-4111-8111-111111111111'
type Job = {
  id: string
  claim_token: string
  attempts: number
  status: string
  quota_reserved: boolean
}
type Admission = { status: string; start_before?: string }
async function admit(job: Job) {
  return (
    await db.query<{ result: Admission }>(
      'SELECT admit_notification_delivery($1,$2,$3) AS result',
      [job.id, job.claim_token, '+919800000000'],
    )
  ).rows[0].result
}
async function seed(count = 1, purpose = 'cheque_reminder') {
  await db.query(
    `INSERT INTO notification_jobs(user_id,purpose) SELECT $1,$2::notification_purpose FROM generate_series(1,$3)`,
    [user, purpose, count],
  )
  return (
    await db.query<Job>('SELECT * FROM claim_notification_jobs($1)', [count])
  ).rows
}
async function unpace() {
  await db.exec(
    "UPDATE notification_provider_capacity SET next_start_at = '-infinity'",
  )
}
async function finish(job: Job, outcome: string) {
  await db.query('SELECT finish_notification_delivery($1,$2,$3,$4,$5)', [
    job.id,
    job.claim_token,
    outcome,
    outcome === 'accepted' ? 'CA-test' : null,
    'test result',
  ])
}
beforeAll(async () => {
  db = await createScalingFixture()
  await db.exec(
    readFileSync(
      fileURLToPath(
        new URL(
          '../../supabase/migrations/20261031050000_notification_provider_capacity.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    ),
  )
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE notification_provider_slots,notification_attempts,notification_jobs,notification_logs,user_quotas,profiles CASCADE;
    INSERT INTO notification_provider_capacity(provider,starts_per_second,max_in_flight) VALUES('twilio_voice',1,5) ON CONFLICT DO NOTHING;
    UPDATE notification_provider_capacity SET starts_per_second = 1,max_in_flight = 5,next_start_at = '-infinity',throttled_total = 0,last_throttled_at = NULL;
    INSERT INTO profiles(user_id) VALUES('${user}');
    INSERT INTO user_quotas(user_id,feature_id,"limit",reset_at) VALUES('${user}','voice_reminder',100,now() + interval '1 day');
    SELECT set_config('request.jwt.claim.role','service_role',false);`)
})
afterAll(async () => {
  await db.close()
})

describe('global provider admission and queue backpressure', () => {
  it('admits only one request in a burst even across independently queued callers', async () => {
    const jobs = await seed(10)
    const results = await Promise.all(jobs.map(admit))
    expect(
      results.filter((result) => result.status === 'started'),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === 'throttled'),
    ).toHaveLength(9)
    const quota = (
      await db.query<{ used: number }>('SELECT used FROM user_quotas')
    ).rows[0]
    expect(quota.used).toBe(1)
    expect(
      (await db.query('SELECT * FROM notification_attempts')).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(1)
    expect(
      Date.parse(
        results.find((result) => result.status === 'started')!.start_before!,
      ),
    ).toBeGreaterThan(Date.now())
  })
  it('enforces five global in-flight requests independently from rate pacing', async () => {
    const jobs = await seed(6)
    for (const job of jobs.slice(0, 5)) {
      await unpace()
      expect((await admit(job)).status).toBe('started')
    }
    await unpace()
    expect((await admit(jobs[5])).status).toBe('throttled')
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(5)
  })
  it('sets the exact one-second admission interval and accepts an already-due boundary', async () => {
    const jobs = await seed(2)
    const admitted = await admit(jobs[0])
    const spacing = (
      await db.query<{ seconds: number }>(
        'SELECT extract(epoch FROM $1::timestamptz - next_start_at)::double precision AS seconds FROM notification_provider_capacity',
        [admitted.start_before],
      )
    ).rows[0].seconds
    expect(spacing).toBe(19)
    await db.exec(
      'UPDATE notification_provider_capacity SET next_start_at = clock_timestamp()',
    )
    expect((await admit(jobs[1])).status).toBe('started')
  })
  it('keeps throttle deferrals pending without consuming attempts, credits, or provider audit rows', async () => {
    const jobs = await seed(2)
    await admit(jobs[0])
    for (let i = 0; i < 5; i++) {
      const job =
        i === 0
          ? jobs[1]
          : (await db.query<Job>('SELECT * FROM claim_notification_jobs(1)'))
              .rows[0]
      await db.exec(
        "UPDATE notification_provider_capacity SET next_start_at = now() + interval '1 minute'",
      )
      expect((await admit(job)).status).toBe('throttled')
      const row = (
        await db.query<Job>('SELECT * FROM notification_jobs WHERE id = $1', [
          job.id,
        ])
      ).rows[0]
      expect(row).toMatchObject({
        status: 'pending',
        attempts: 0,
        claim_token: null,
        quota_reserved: false,
      })
      await db.query(
        "UPDATE notification_jobs SET scheduled_at = now() - interval '1 second' WHERE id = $1",
        [job.id],
      )
    }
    expect(
      (await db.query<{ used: number }>('SELECT used FROM user_quotas')).rows[0]
        .used,
    ).toBe(1)
    expect(
      (await db.query('SELECT * FROM notification_attempts')).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT * FROM notification_logs')).rows,
    ).toHaveLength(0)
  })
  it.each(['accepted', 'rejected', 'uncertain'])(
    'settles %s with appropriate slot retention and accounting',
    async (outcome) => {
      const [job] = await seed()
      await admit(job)
      await finish(job, outcome)
      expect(
        (await db.query('SELECT * FROM notification_provider_slots')).rows,
      ).toHaveLength(outcome === 'uncertain' ? 1 : 0)
      expect(
        (await db.query<{ used: number }>('SELECT used FROM user_quotas'))
          .rows[0].used,
      ).toBe(outcome === 'rejected' ? 0 : 1)
      if (outcome !== 'uncertain') await finish(job, outcome)
      expect(
        (await db.query('SELECT * FROM notification_logs')).rows,
      ).toHaveLength(outcome === 'uncertain' ? 0 : 1)
    },
  )
  it('shares the same gate between reminders, test calls and targeted claims', async () => {
    const [reminder] = await seed()
    await admit(reminder)
    const [sample] = await seed(1, 'sample_voice_test')
    expect((await admit(sample)).status).toBe('throttled')
    await db.query(
      'UPDATE notification_jobs SET scheduled_at = now() WHERE id = $1',
      [sample.id],
    )
    const targeted = (
      await db.query<Job>('SELECT * FROM claim_notification_jobs(1,$1,$2)', [
        [sample.id],
        user,
      ])
    ).rows[0]
    expect((await admit(targeted)).status).toBe('throttled')
  })
  it('denies quota exhaustion without consuming provider capacity or pacing', async () => {
    await db.exec('UPDATE user_quotas SET used = 100')
    const [job] = await seed()
    expect(await admit(job)).toEqual({ status: 'quota_exhausted' })
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query('SELECT * FROM notification_attempts')).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query<{ next_start_at: string }>(
          'SELECT next_start_at::text FROM notification_provider_capacity',
        )
      ).rows[0].next_start_at,
    ).toBe('-infinity')
  })
  it('rejects invalid/stale/started claims and invalid recipients before touching capacity', async () => {
    const [job] = await seed()
    await expect(
      db.query('SELECT admit_notification_delivery($1,NULL,$2)', [
        job.id,
        '+919800000000',
      ]),
    ).rejects.toThrow('no longer valid')
    await expect(
      db.query('SELECT admit_notification_delivery($1,$2,$3)', [
        job.id,
        job.claim_token,
        'invalid',
      ]),
    ).rejects.toThrow('Invalid recipient')
    await admit(job)
    await expect(admit(job)).rejects.toThrow('no longer valid')
    expect(
      (await db.query<{ used: number }>('SELECT used FROM user_quotas')).rows[0]
        .used,
    ).toBe(1)
  })
  it('denies expired or deactivated claims before reserving quota', async () => {
    const [job] = await seed()
    await db.exec(
      "UPDATE notification_jobs SET lease_until = now() - interval '1 second'",
    )
    await expect(admit(job)).rejects.toThrow('no longer valid')
    await db.exec(
      "UPDATE notification_jobs SET lease_until = now() + interval '1 minute'; UPDATE profiles SET deleted_at = now()",
    )
    await expect(admit(job)).rejects.toThrow('no longer valid')
    expect(
      (await db.query<{ used: number }>('SELECT used FROM user_quotas')).rows[0]
        .used,
    ).toBe(0)
  })
  it('retains uncertain capacity until explicit reconciliation and releases it exactly once', async () => {
    const [job] = await seed()
    await admit(job)
    await finish(job, 'uncertain')
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(1)
    await finish(job, 'accepted')
    await finish(job, 'accepted')
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query('SELECT * FROM notification_logs')).rows,
    ).toHaveLength(1)
    expect(
      (await db.query<{ used: number }>('SELECT used FROM user_quotas')).rows[0]
        .used,
    ).toBe(1)
  })
  it('fails closed for missing configuration, private bypass calls and legacy dispatchers', async () => {
    const [job] = await seed()
    await db.exec('SET ROLE service_role')
    await expect(
      db.query('SELECT reserve_notification_delivery_quota($1,$2,$3)', [
        job.id,
        job.claim_token,
        '+919800000000',
      ]),
    ).rejects.toThrow('permission denied')
    await expect(
      db.query('SELECT start_notification_delivery($1,$2,$3)', [
        job.id,
        job.claim_token,
        '+919800000000',
      ]),
    ).rejects.toThrow('Upgrade')
    await db.exec('RESET ROLE; DELETE FROM notification_provider_capacity')
    await expect(admit(job)).rejects.toThrow('configuration unavailable')
    expect(
      (await db.query<{ used: number }>('SELECT used FROM user_quotas')).rows[0]
        .used,
    ).toBe(0)
  })
  it('recovers expired capacity without redelivering uncertain calls', async () => {
    const [oldJob] = await seed()
    await admit(oldJob)
    await db.exec(
      "UPDATE notification_provider_slots SET expires_at = now() - interval '1 second'; UPDATE notification_jobs SET lease_until = now() - interval '1 second'",
    )
    const [newJob] = await seed()
    await unpace()
    expect((await admit(newJob)).status).toBe('started')
    expect(
      (
        await db.query<Job>('SELECT * FROM notification_jobs WHERE id = $1', [
          oldJob.id,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'failed', quota_reserved: true })
    expect(
      (await db.query('SELECT * FROM notification_provider_slots')).rows,
    ).toHaveLength(1)
  })
  it('exposes aggregate-only health and denies anonymous/authenticated access', async () => {
    const jobs = await seed(2)
    await admit(jobs[0])
    await admit(jobs[1])
    const health = (
      await db.query('SELECT * FROM notification_provider_health()')
    ).rows[0]
    expect(health).toMatchObject({
      starts_per_second: 1,
      max_in_flight: 5,
      in_flight: 1,
      expired_slots: 0,
      throttled_total: 1,
    })
    expect(JSON.stringify(health)).not.toContain(user)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`)
      await expect(
        db.query('SELECT * FROM notification_provider_capacity'),
      ).rejects.toThrow('permission denied')
      await expect(
        db.query('SELECT * FROM notification_provider_health()'),
      ).rejects.toThrow('permission denied')
      await expect(admit(jobs[1])).rejects.toThrow('permission denied')
      await db.exec('RESET ROLE')
    }
  })
})
