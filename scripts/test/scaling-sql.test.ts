// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const user = '11111111-1111-4111-8111-111111111111'
const business = '22222222-2222-4222-8222-222222222222'
type Claim = { id: string; claim_token: string }

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TYPE notification_job_status AS ENUM ('pending','processing','sent','failed','skipped','cancelled');
    CREATE TYPE notification_log_status AS ENUM ('success','failed');
    CREATE TYPE notification_channel AS ENUM ('voice','whatsapp','email','push','sms');
    CREATE TYPE notification_purpose AS ENUM ('cheque_reminder','sample_voice_test');
    CREATE TABLE profiles(user_id uuid PRIMARY KEY, deleted_at timestamptz,
      voice_call_enabled boolean DEFAULT true, phone text DEFAULT '+919800000000',
      time_zone text DEFAULT 'Asia/Kolkata', reminders_per_day int DEFAULT 1);
    CREATE TABLE businesses(id uuid PRIMARY KEY, user_id uuid, deleted_at timestamptz);
    CREATE TABLE parties(id uuid PRIMARY KEY, name text);
    CREATE TABLE cheques(id uuid PRIMARY KEY, business_id uuid, party_id uuid,
      cheque_number text, amount numeric, notes text, type text DEFAULT 'Outward',
      status text DEFAULT 'Issued', cheque_date date DEFAULT '2026-10-31',
      deposit_date date, remind_before_days int, is_draft boolean DEFAULT false, deleted_at timestamptz);
    CREATE TABLE user_quotas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      feature_id text, used int DEFAULT 0, "limit" int DEFAULT 5, reset_at timestamptz, updated_at timestamptz);
    CREATE TABLE notification_jobs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, business_id uuid,
      channel notification_channel DEFAULT 'voice', purpose notification_purpose DEFAULT 'cheque_reminder', payload jsonb DEFAULT '{}',
      scheduled_at timestamptz DEFAULT now(), status notification_job_status DEFAULT 'pending',
      attempts int DEFAULT 0, last_error text, idempotency_key text UNIQUE,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE notification_logs(id uuid DEFAULT gen_random_uuid(), job_id uuid, user_id uuid,
      channel notification_channel, purpose notification_purpose, recipient text, status notification_log_status, provider text,
      provider_message_id text, error text);
    CREATE FUNCTION lifecycle_user_active(requested_user uuid DEFAULT auth.uid())
      RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = requested_user AND deleted_at IS NULL) $$;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigint, jobname text);
    CREATE FUNCTION cron.alter_job(job_id bigint, schedule text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_businesses ON businesses TO authenticated USING(user_id = auth.uid());
    CREATE POLICY own_cheques ON cheques TO authenticated USING(EXISTS
      (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.user_id = auth.uid()));
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT SELECT ON businesses,cheques,parties TO authenticated;
  `)
  for (const migration of [
    '20261031000000_bounded_cheque_reads.sql',
    '20261031010000_notification_delivery_leases.sql',
    '20261031020000_bounded_notification_scheduler.sql',
  ]) {
    await db.exec(
      readFileSync(
        join(process.cwd(), 'supabase', 'migrations', migration),
        'utf8',
      ),
    )
  }
}, 30_000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE notification_attempts, notification_jobs, notification_logs,
    notification_scheduler_runs, user_quotas, cheques, parties, businesses, profiles CASCADE;
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
    await db.exec(`INSERT INTO parties VALUES('33333333-3333-4333-8333-333333333333','Supplier');
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
      await db.exec(`TRUNCATE profiles,businesses,cheques;
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
