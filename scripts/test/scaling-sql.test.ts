// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { createScalingFixture } from '../lib/scaling-fixture'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const user = '11111111-1111-4111-8111-111111111111'
const business = '22222222-2222-4222-8222-222222222222'
type Claim = { id: string; claim_token: string }

beforeAll(async () => {
  db = await createScalingFixture()
}, 30_000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE notification_attempts, notification_jobs, notification_logs,
    notification_scheduler_runs, user_quotas, cheques, accounts, banks, parties, businesses, profiles CASCADE;
    SELECT set_config('request.jwt.claim.sub','${user}',false);
    SELECT set_config('request.jwt.claim.role','service_role',false);
    INSERT INTO profiles(user_id) VALUES('${user}');
    INSERT INTO businesses(id,user_id) VALUES('${business}','${user}');
    INSERT INTO user_quotas(user_id,feature_id) VALUES('${user}','voice_reminder');`)
})
afterAll(async () => {
  await db.close()
})

async function claim(): Promise<Claim> {
  const { rows } = await db.query<Claim>(
    'SELECT id,claim_token FROM claim_notification_jobs(1)',
  )
  return rows[0]
}
async function start(job: Claim) {
  return db.query<{ allowed: boolean }>(
    'SELECT start_notification_delivery($1,$2,$3) AS allowed',
    [job.id, job.claim_token, '+919800000000'],
  )
}
async function finish(job: Claim, outcome: string, sid: string | null = null) {
  return db.query('SELECT finish_notification_delivery($1,$2,$3,$4,$5)', [
    job.id,
    job.claim_token,
    outcome,
    sid,
    outcome === 'accepted' ? null : 'provider failure',
  ])
}
async function used() {
  return (await db.query<{ used: number }>('SELECT used FROM user_quotas'))
    .rows[0].used
}
async function enqueue() {
  await db.query(
    'INSERT INTO notification_jobs(user_id,business_id,idempotency_key) VALUES($1,$2,$3)',
    [user, business, crypto.randomUUID()],
  )
  return claim()
}

describe('bounded cheque reads', () => {
  it('pages bank aggregates without truncating the summary, excludes drafts/deleted/inward, and uses due dates', async () => {
    await db.exec(`
      INSERT INTO banks(id,name) SELECT md5('bank'||i)::uuid,'Bank '||i FROM generate_series(1,51) i;
      INSERT INTO accounts(id,business_id,bank_id)
        SELECT md5('account'||i)::uuid,'${business}',md5('bank'||i)::uuid FROM generate_series(1,51) i;
      INSERT INTO cheques(id,business_id,account_id,amount,deposit_date)
        SELECT md5('cheque'||i)::uuid,'${business}',md5('account'||i)::uuid,i,'2026-10-30' FROM generate_series(1,51) i;
      INSERT INTO cheques(id,business_id,amount,is_draft) VALUES(gen_random_uuid(),'${business}',999,true);
      INSERT INTO cheques(id,business_id,amount,deleted_at) VALUES(gen_random_uuid(),'${business}',999,now());
      INSERT INTO cheques(id,business_id,amount,type,status,deposit_date)
        VALUES(gen_random_uuid(),'${business}',5,'Inward','Received','2026-10-31');
      SET ROLE authenticated;`)
    type Analytics = {
      matching_banks: number
      banks: { name: string; metrics: { total_amount: number }[] }[]
      summary: {
        cheque_count: number
        total_amount: number
        overdue_count: number
        overdue_amount: number
        today_count: number
      }[]
    }
    const result = await db.query<{ data: Analytics }>(
      `SELECT cheque_analytics($1,'2026-10-31',false,'2026-10-31','2026-10-31','All',0,50) AS data`,
      [business],
    )
    const data = result.rows[0].data
    expect(data.matching_banks).toBe(51)
    expect(data.banks).toHaveLength(50)
    expect(data.banks[0].name).toBe('Bank 51')
    expect(data.summary).toEqual([
      {
        status: 'Issued',
        type: 'Outward',
        cheque_count: 51,
        total_amount: 1326,
        today_count: 0,
        today_amount: 0,
        overdue_count: 51,
        overdue_amount: 1326,
      },
    ])
    const next = await db.query<{ data: Analytics }>(
      `SELECT cheque_analytics($1,'2026-10-31',false,'2026-10-31','2026-10-31','All',50,50) AS data`,
      [business],
    )
    expect(next.rows[0].data.banks).toHaveLength(1)
    expect(next.rows[0].data.banks[0].name).toBe('Bank 1')
    const inward = await db.query<{ data: Analytics }>(
      `SELECT cheque_analytics($1,'2026-10-31',true,'2026-10-31','2026-10-31','Inward') AS data`,
      [business],
    )
    expect(inward.rows[0].data.summary[0]).toMatchObject({
      cheque_count: 1,
      total_amount: 5,
      today_count: 1,
      overdue_count: 0,
    })
  })
  it('rejects an unbounded/null page limit instead of returning every record', async () => {
    await db.exec('SET ROLE authenticated')
    await expect(
      db.query('SELECT * FROM cheque_list_page($1, requested_limit := NULL)', [
        business,
      ]),
    ).rejects.toThrow('Invalid cheque page request')
  })
  it('pages all 10,000 cheques exactly once and searches beyond the API cap', async () => {
    await db.exec(`INSERT INTO cheques(id,business_id,cheque_number,amount)
      SELECT md5(i::text)::uuid,'${business}',i::text,i FROM generate_series(1,10000) i;
      SET ROLE authenticated;`)
    const ids = new Set<string>()
    for (let offset = 0; offset < 10_000; offset += 100) {
      const { rows } = await db.query<{
        cheque_id: string
        matching_count: number
      }>(
        'SELECT * FROM cheque_list_page($1, requested_limit := 100, requested_offset := $2)',
        [business, offset],
      )
      expect(rows).toHaveLength(100)
      expect(Number(rows[0].matching_count)).toBe(10_000)
      rows.forEach((row) => ids.add(row.cheque_id))
    }
    expect(ids.size).toBe(10_000)
    const aggregate = await db.query<{
      cheque_count: number
      total_amount: number
      today_count: number
    }>("SELECT * FROM cheque_summary($1,'2026-10-31')", [business])
    expect(Number(aggregate.rows[0].cheque_count)).toBe(10000)
    expect(Number(aggregate.rows[0].total_amount)).toBe(50005000)
    expect(Number(aggregate.rows[0].today_count)).toBe(10000)
    const { rows } = await db.query<{ cheque_id: string }>(
      "SELECT * FROM cheque_list_page($1, requested_search := '10000')",
      [business],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].cheque_id).not.toBeNull()
  }, 30_000)

  it('preserves native filters, draft/deletion exclusion, exact summaries and RLS', async () => {
    await db.exec(`INSERT INTO parties(id,name) VALUES('33333333-3333-4333-8333-333333333333','Supplier');
      INSERT INTO cheques(id,business_id,party_id,cheque_number,amount,notes)
      VALUES(gen_random_uuid(),'${business}','33333333-3333-4333-8333-333333333333','123456',100,'urgent payment');
      INSERT INTO cheques(id,business_id,amount,is_draft) VALUES(gen_random_uuid(),'${business}',999,true);
      INSERT INTO cheques(id,business_id,amount,deleted_at) VALUES(gen_random_uuid(),'${business}',999,now());
      INSERT INTO businesses VALUES('44444444-4444-4444-8444-444444444444',gen_random_uuid(),NULL);
      INSERT INTO cheques(id,business_id,amount) VALUES(gen_random_uuid(),'44444444-4444-4444-8444-444444444444',999);
      SET ROLE authenticated;`)
    const { rows } = await db.query<{
      matching_count: number
      active_count: number
    }>(
      "SELECT * FROM cheque_list_page($1, requested_search := 'supplier', requested_native_search := 'urgent', requested_type := 'Outward')",
      [business],
    )
    expect(Number(rows[0].matching_count)).toBe(1)
    expect(Number(rows[0].active_count)).toBe(1)
    const summary = await db.query<{ upcoming_total: number }>(
      "SELECT * FROM business_cheque_summaries('2026-10-31')",
    )
    expect(summary.rows).toHaveLength(1)
    expect(Number(summary.rows[0].upcoming_total)).toBe(100)
    const foreign = await db.query<{ cheque_id: string | null }>(
      "SELECT * FROM cheque_list_page('44444444-4444-4444-8444-444444444444')",
    )
    expect(foreign.rows[0].cheque_id).toBeNull()
  })
})

describe('delivery leases and credit settlement', () => {
  it('does not let an application user execute service-only delivery RPCs', async () => {
    await db.exec('SET ROLE authenticated')
    await expect(
      db.query('SELECT * FROM claim_notification_jobs(5)'),
    ).rejects.toThrow('permission denied')
    await expect(
      db.query('SELECT start_notification_delivery($1,$2,$3)', [
        crypto.randomUUID(),
        crypto.randomUUID(),
        '+919800000000',
      ]),
    ).rejects.toThrow('permission denied')
  })
  it('charges once for acceptance and idempotently writes one audit', async () => {
    const job = await enqueue()
    expect((await start(job)).rows[0].allowed).toBe(true)
    await finish(job, 'accepted', 'CA1')
    await finish(job, 'accepted', 'CA1')
    expect(await used()).toBe(1)
    expect(
      (await db.query('SELECT * FROM notification_logs')).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('SELECT * FROM claim_notification_jobs(5)')).rows,
    ).toHaveLength(0)
  })
  it('refunds rejection and only charges the eventual accepted retry', async () => {
    const job = await enqueue()
    await start(job)
    await finish(job, 'rejected')
    await finish(job, 'rejected')
    expect(await used()).toBe(0)
    await db.exec('UPDATE notification_jobs SET scheduled_at = now()')
    const retry = await claim()
    expect(retry.claim_token).not.toBe(job.claim_token)
    await expect(start(job)).rejects.toThrow('no longer valid')
    await start(retry)
    await finish(retry, 'accepted', 'CA2')
    expect(await used()).toBe(1)
  })
  it('reclaims only unstarted leases and holds uncertain deliveries for reconciliation', async () => {
    const unstarted = await enqueue()
    await db.exec(
      "UPDATE notification_jobs SET lease_until = now() - interval '1 minute'",
    )
    const retry = await claim()
    expect(retry.id).toBe(unstarted.id)
    await start(retry)
    await db.exec(
      "UPDATE notification_jobs SET lease_until = now() - interval '1 minute'",
    )
    expect(
      (await db.query('SELECT * FROM claim_notification_jobs(5)')).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs',
        )
      ).rows[0].status,
    ).toBe('failed')
    expect(await used()).toBe(1)
    await finish(retry, 'rejected')
    expect(await used()).toBe(0)
  })
  it('rolls back acceptance if audit persistence fails, then safely retries finalization', async () => {
    const job = await enqueue()
    await start(job)
    await db.exec(
      "ALTER TABLE notification_logs ADD CONSTRAINT reject_test CHECK(provider_message_id <> 'CA1')",
    )
    await expect(finish(job, 'accepted', 'CA1')).rejects.toThrow()
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_jobs',
        )
      ).rows[0].status,
    ).toBe('processing')
    await db.exec('ALTER TABLE notification_logs DROP CONSTRAINT reject_test')
    await finish(job, 'accepted', 'CA1')
    expect(await used()).toBe(1)
    expect(
      (await db.query('SELECT * FROM notification_logs')).rows,
    ).toHaveLength(1)
  })
  it('does not refund an old reservation into a new quota period', async () => {
    const job = await enqueue()
    await start(job)
    await db.exec(
      "UPDATE user_quotas SET reset_at = now() + interval '30 days', used = 2",
    )
    await finish(job, 'rejected')
    expect(await used()).toBe(2)
  })
})

describe('durable scheduler batches', () => {
  it.each([1001, 10000])(
    'schedules %i eligible profiles completely and idempotently',
    async (count) => {
      await db.exec(`TRUNCATE profiles,businesses,cheques CASCADE;
      INSERT INTO profiles(user_id) SELECT md5(i::text)::uuid FROM generate_series(1,${count}) i;
      INSERT INTO businesses(id,user_id) SELECT user_id,user_id FROM profiles;
      INSERT INTO cheques(id,business_id,cheque_number,amount)
        SELECT id,id,'123456',100 FROM businesses;
      ANALYZE profiles; ANALYZE businesses; ANALYZE cheques;`)
      let total = 0
      let batches = 0
      for (;;) {
        const { rows } = await db.query<{
          enqueued: number
          completed: boolean
        }>("SELECT * FROM schedule_notification_batch('2026-10-31T03:30:00Z')")
        total += rows[0].enqueued
        batches++
        if (rows[0].completed) break
        expect(batches).toBeLessThanOrEqual(Math.floor(count / 200) + 1)
      }
      expect(batches).toBe(Math.floor(count / 200) + 1)
      expect(total).toBe(count)
      expect(
        (
          await db.query<{ enqueued: number }>(
            "SELECT * FROM schedule_notification_batch('2026-10-31T03:30:00Z')",
          )
        ).rows[0].enqueued,
      ).toBe(0)
    },
    60_000,
  )
})

describe('aggregate-only notification health', () => {
  it('is service-only, validates windows, and reports empty counts explicitly', async () => {
    await db.exec('SET ROLE authenticated')
    await expect(
      db.query('SELECT * FROM notification_health(60)'),
    ).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
    for (const window of [null, 0, 1441]) {
      await expect(
        db.query('SELECT * FROM notification_health($1)', [window]),
      ).rejects.toThrow('Health window')
    }
    const { rows } = await db.query('SELECT * FROM notification_health(60)')
    expect(rows).toEqual([
      {
        pending_due: 0,
        pending_future: 0,
        processing: 0,
        expired_leases: 0,
        reconciliation_required: 0,
        oldest_due_age_seconds: 0,
        sent_in_window: 0,
        failed_in_window: 0,
        skipped_in_window: 0,
        cancelled_in_window: 0,
        incomplete_scheduler_runs: 0,
        oldest_scheduler_age_seconds: 0,
        scheduler_checkpoint_age_seconds: null,
      },
    ])
  })
  it('counts queues beyond the API cap, separates future work, and never exposes private job fields', async () => {
    await db.exec(`INSERT INTO notification_jobs(user_id,business_id,idempotency_key,scheduled_at)
      SELECT '${user}','${business}',i::text,now() - interval '10 minutes' FROM generate_series(1,1001) i;
      INSERT INTO notification_jobs(user_id,business_id,idempotency_key,scheduled_at,payload)
        VALUES('${user}','${business}','future',now() + interval '1 hour','{"phone":"private"}');
      INSERT INTO notification_scheduler_runs(run_at,updated_at)
        VALUES(now() - interval '20 minutes',now() - interval '5 minutes');`)
    const before = (
      await db.query(
        'SELECT status,attempts,quota_reserved FROM notification_jobs ORDER BY id',
      )
    ).rows
    await db.exec('SET ROLE service_role')
    const { rows } = await db.query<{
      pending_due: number
      pending_future: number
      oldest_due_age_seconds: number
      incomplete_scheduler_runs: number
      oldest_scheduler_age_seconds: number
    }>('SELECT * FROM notification_health(60)')
    expect(rows[0].pending_due).toBe(1001)
    expect(rows[0].pending_future).toBe(1)
    expect(rows[0].oldest_due_age_seconds).toBeGreaterThanOrEqual(600)
    expect(rows[0].incomplete_scheduler_runs).toBe(1)
    expect(rows[0].oldest_scheduler_age_seconds).toBeGreaterThanOrEqual(1200)
    expect(JSON.stringify(rows)).not.toContain(user)
    expect(JSON.stringify(rows)).not.toContain('private')
    await db.exec('RESET ROLE')
    expect(
      (
        await db.query(
          'SELECT status,attempts,quota_reserved FROM notification_jobs ORDER BY id',
        )
      ).rows,
    ).toEqual(before)
  })
  it('measures recent state changes, expired leases and unresolved reservations', async () => {
    const accepted = await enqueue()
    await start(accepted)
    await finish(accepted, 'accepted', 'accepted')
    // Recent acceptance of an old queued job still counts in the outcomes window.
    await db.exec(
      "UPDATE notification_jobs SET created_at = now() - interval '7 days'",
    )
    const uncertain = await enqueue()
    await start(uncertain)
    await finish(uncertain, 'uncertain')
    const expired = await enqueue()
    await db.query(
      "UPDATE notification_jobs SET lease_until = now() - interval '1 minute' WHERE id = $1",
      [expired.id],
    )
    await db.exec(`INSERT INTO notification_jobs(user_id,business_id,idempotency_key,status,updated_at)
      VALUES('${user}','${business}','old-failure','failed',now() - interval '2 hours'),
        ('${user}','${business}','skip','skipped',now());`)
    const { rows } = await db.query('SELECT * FROM notification_health(60)')
    expect(rows[0]).toMatchObject({
      processing: 1,
      expired_leases: 1,
      reconciliation_required: 1,
      sent_in_window: 1,
      failed_in_window: 1,
      skipped_in_window: 1,
    })
    await finish(uncertain, 'rejected')
    expect(
      (
        await db.query<{ reconciliation_required: number }>(
          'SELECT * FROM notification_health(60)',
        )
      ).rows[0].reconciliation_required,
    ).toBe(0)
  })
})
