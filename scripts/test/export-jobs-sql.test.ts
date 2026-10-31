// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { createScalingFixture } from '../lib/scaling-fixture'

let db: PGlite
const user = '11111111-1111-4111-8111-111111111111'
const business = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
type Job = {
  id: string
  claim_token: string
  next_part: number
  status: string
  row_count: number
  attempts: number
}
beforeAll(async () => {
  db = await createScalingFixture()
  await db.exec(`
    ALTER TABLE profiles ADD COLUMN premium boolean DEFAULT true;
    ALTER TABLE parties ADD COLUMN business_id uuid,ADD COLUMN contact text, ADD COLUMN color text, ADD COLUMN icon text,
      ADD COLUMN avatar_url text, ADD COLUMN deleted_at timestamptz;
    CREATE TABLE banks(id uuid PRIMARY KEY,name text,logo_url text,deleted_at timestamptz);
    CREATE TABLE accounts(id uuid PRIMARY KEY,business_id uuid,account_name text,color text,icon text,bank_id uuid,deleted_at timestamptz);
    ALTER TABLE cheques ADD COLUMN account_id uuid;
    ALTER TABLE cheques ADD COLUMN image_url text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE FUNCTION public.has_lifetime_premium() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT premium FROM profiles WHERE user_id = auth.uid() $$;
    CREATE FUNCTION public.premium_workspace_assert_owner(requested_business uuid) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
        IF NOT coalesce(public.has_lifetime_premium(),false) OR NOT EXISTS
          (SELECT 1 FROM businesses WHERE id = requested_business AND user_id = auth.uid() AND deleted_at IS NULL)
          THEN RAISE EXCEPTION 'Premium or owner unavailable' USING ERRCODE = '42501'; END IF;
      END $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    INSERT INTO storage.buckets VALUES('report-exports','Existing exports',true);
    INSERT INTO storage.objects(bucket_id,name) VALUES('report-exports','existing.part');
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT SELECT ON storage.objects TO authenticated;
    CREATE FUNCTION cron.schedule(job_name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS
      $$ BEGIN INSERT INTO cron.job(jobid,jobname) VALUES(99,job_name); RETURN 99; END $$;
    ALTER TABLE cron.job ADD COLUMN active boolean DEFAULT true;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active = $2 WHERE jobid = $1 $$;
  `)
  await db.exec(
    readFileSync(
      fileURLToPath(
        new URL(
          '../../supabase/migrations/20261031040000_background_exports.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    ),
  )
  expect(
    (await db.query('SELECT name, public FROM storage.buckets')).rows,
  ).toEqual([{ name: 'Existing exports', public: false }])
  expect(
    (await db.query('SELECT bucket_id, name FROM storage.objects')).rows,
  ).toEqual([{ bucket_id: 'report-exports', name: 'existing.part' }])
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE report_export_rows,report_export_jobs,cheques,accounts,banks,parties,businesses,profiles,storage.objects CASCADE;
    INSERT INTO profiles(user_id) VALUES('${user}');
    INSERT INTO businesses(id,user_id) VALUES('${business}','${user}');
    INSERT INTO cheques(id,business_id,cheque_number,amount) VALUES(gen_random_uuid(),'${business}','000001',100);
    SELECT set_config('request.jwt.claim.sub','${user}',false);`)
})
afterAll(async () => {
  await db.close()
})
async function request(jobId = id, include = true) {
  return (
    await db.query<Job>("SELECT * FROM request_report_export($1,$2,'csv',$3)", [
      jobId,
      business,
      include,
    ])
  ).rows[0]
}
async function claim() {
  return (await db.query<Job>('SELECT * FROM claim_report_export()')).rows[0]
}

describe('frozen background exports and private lifecycle', () => {
  it('keeps a pre-existing export bucket private after migration replay', async () => {
    expect(
      (
        await db.query(
          "SELECT id, public FROM storage.buckets WHERE id = 'report-exports'",
        )
      ).rows,
    ).toEqual([{ id: 'report-exports', public: false }])
  })
  it('starts the cron paused until the worker is deployed', async () => {
    expect(
      (
        await db.query<{ active: boolean }>(
          "SELECT active FROM cron.job WHERE jobname = 'report-exports-tick'",
        )
      ).rows[0].active,
    ).toBe(false)
  })
  it('freezes scalar fields and relations and excludes drafts/deletions/inward when requested', async () => {
    await db.exec(`INSERT INTO parties(id,business_id,name) VALUES('${id}','${business}','Original party');
      INSERT INTO banks(id,name) VALUES('${id}','Original bank');
      INSERT INTO accounts(id,business_id,account_name,bank_id) VALUES('${id}','${business}','Original account','${id}');
      UPDATE cheques SET party_id = '${id}';
      UPDATE cheques SET account_id = '${id}';
      INSERT INTO cheques(id,business_id,amount,type) VALUES(gen_random_uuid(),'${business}',500,'Inward');
      INSERT INTO cheques(id,business_id,amount,is_draft) VALUES(gen_random_uuid(),'${business}',100,true);`)
    expect((await request(id, false)).row_count).toBe(1)
    await db.exec(
      "UPDATE cheques SET amount = 999; UPDATE parties SET name = 'Changed'; UPDATE banks SET name = 'Changed'; UPDATE accounts SET account_name = 'Changed'; DELETE FROM cheques",
    )
    const job = await claim()
    const batch = await db.query<{
      payload: {
        amount: number
        party: { name: string }
        account: { account_name: string; bank: { name: string } }
      }
    }>('SELECT * FROM report_export_batch($1,$2)', [id, job.claim_token])
    expect(batch.rows[0].payload.amount).toBe(100)
    expect(batch.rows[0].payload.party.name).toBe('Original party')
    expect(batch.rows[0].payload.account.account_name).toBe('Original account')
    expect(batch.rows[0].payload.account.bank.name).toBe('Original bank')
  })
  it('makes request retries idempotent and serializes one active job per account', async () => {
    await request()
    await request()
    expect(
      (await db.query('SELECT * FROM report_export_jobs')).rows,
    ).toHaveLength(1)
    await expect(request(id, false)).rejects.toThrow('Conflicting')
    await expect(request(crypto.randomUUID())).rejects.toThrow(
      'already in progress',
    )
  })
  it('denies other tenants, anonymous callers, expired premium and direct snapshot reads', async () => {
    await db.exec('SET ROLE authenticated')
    await request()
    await expect(db.query('SELECT * FROM report_export_rows')).rejects.toThrow(
      'permission denied',
    )
    await expect(
      db.query('SELECT * FROM claim_report_export()'),
    ).rejects.toThrow('permission denied')
    await db.exec(
      `SELECT set_config('request.jwt.claim.sub','${crypto.randomUUID()}',false)`,
    )
    expect(
      (await db.query('SELECT * FROM report_export_jobs')).rows,
    ).toHaveLength(0)
    await expect(
      db.query('SELECT * FROM report_export_download($1)', [id]),
    ).rejects.toThrow('unavailable')
    await db.exec(
      `RESET ROLE; UPDATE profiles SET premium = false; SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`,
    )
    await expect(request(crypto.randomUUID())).rejects.toThrow('Premium')
  })
  it('checks limits without silently truncating or leaving a partial job', async () => {
    await db.exec(`TRUNCATE cheques; INSERT INTO cheques(id,business_id,amount)
      SELECT md5(i::text)::uuid,'${business}',i FROM generate_series(1,50001) i;`)
    await expect(request()).rejects.toThrow('50000 rows')
    expect(
      (await db.query('SELECT * FROM report_export_jobs')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query('SELECT * FROM report_export_rows')).rows,
    ).toHaveLength(0)
  }, 30000)
  it('accepts exactly 50000 rows and produces at most 100 storage parts', async () => {
    await db.exec(`TRUNCATE cheques; INSERT INTO cheques(id,business_id,amount)
      SELECT md5(i::text)::uuid,'${business}',i FROM generate_series(1,50000) i;`)
    const job = await request()
    expect(job.row_count).toBe(50000)
    expect(
      (
        await db.query<{ part_count: number }>(
          'SELECT part_count FROM report_export_jobs',
        )
      ).rows[0].part_count,
    ).toBe(100)
  }, 30000)
  it('enforces ten requests in a rolling day even after cancellations', async () => {
    for (let i = 0; i < 10; i++) {
      const jobId = crypto.randomUUID()
      await request(jobId)
      await db.query('SELECT cancel_report_export($1)', [jobId])
    }
    await expect(request()).rejects.toThrow('Daily export request limit')
  })
  it('rejects snapshots exceeding 50 MiB atomically', async () => {
    await db.exec(`TRUNCATE cheques; INSERT INTO cheques(id,business_id,amount,notes)
      SELECT gen_random_uuid(),'${business}',100,repeat('x',1100000) FROM generate_series(1,50);`)
    await expect(request()).rejects.toThrow('50 MiB')
    expect(
      (await db.query('SELECT * FROM report_export_jobs')).rows,
    ).toHaveLength(0)
  }, 30000)
  it('checkpoints idempotently, survives lost responses, and rejects stale ownership tokens', async () => {
    await db.exec(
      `INSERT INTO cheques(id,business_id,amount) SELECT gen_random_uuid(),'${business}',i FROM generate_series(1,500) i`,
    )
    await request()
    const job = await claim()
    expect(
      (
        await db.query('SELECT * FROM report_export_batch($1,$2)', [
          id,
          job.claim_token,
        ])
      ).rows,
    ).toHaveLength(500)
    await db.query('SELECT * FROM advance_report_export($1,$2,0)', [
      id,
      job.claim_token,
    ])
    expect(
      (
        await db.query<Job>('SELECT * FROM advance_report_export($1,$2,0)', [
          id,
          job.claim_token,
        ])
      ).rows[0].next_part,
    ).toBe(1)
    await db.exec(
      "UPDATE report_export_jobs SET lease_until = now() - interval '1 minute'",
    )
    const retry = await claim()
    await expect(
      db.query('SELECT * FROM report_export_batch($1,$2)', [
        id,
        job.claim_token,
      ]),
    ).rejects.toThrow('Stale')
    expect(
      (
        await db.query('SELECT * FROM report_export_batch($1,$2)', [
          id,
          retry.claim_token,
        ])
      ).rows,
    ).toHaveLength(1)
    expect(
      (
        await db.query<Job>('SELECT * FROM advance_report_export($1,$2,1)', [
          id,
          retry.claim_token,
        ])
      ).rows[0].status,
    ).toBe('ready')
    expect(
      (await db.query('SELECT * FROM report_export_rows')).rows,
    ).toHaveLength(0)
  })
  it('does not exhaust retry attempts on healthy budget pauses', async () => {
    await request()
    for (let i = 0; i < 5; i++) {
      const job = await claim()
      expect(job.attempts).toBe(1)
      await db.query('SELECT release_report_export($1,$2,false)', [
        id,
        job.claim_token,
      ])
    }
    for (let i = 0; i < 3; i++) {
      const job = await claim()
      await db.query('SELECT release_report_export($1,$2,true)', [
        id,
        job.claim_token,
      ])
    }
    expect(
      (await db.query<Job>('SELECT * FROM report_export_jobs')).rows[0].status,
    ).toBe('failed')
  })
  it('rejects null leases, expired claims and null tokens', async () => {
    await request()
    const job = await claim()
    await expect(
      db.query('SELECT * FROM report_export_batch($1,NULL)', [id]),
    ).rejects.toThrow('Stale')
    await db.exec('UPDATE report_export_jobs SET lease_until = NULL')
    await expect(
      db.query('SELECT * FROM report_export_batch($1,$2)', [
        id,
        job.claim_token,
      ]),
    ).rejects.toThrow('Stale')
    await expect(
      db.query('SELECT * FROM advance_report_export($1,$2,0)', [
        id,
        job.claim_token,
      ]),
    ).rejects.toThrow('Stale')
  })
  it('permits only ready owner downloads and rechecks premium, expiry, and business lifecycle', async () => {
    await request()
    const job = await claim()
    await db.query('SELECT * FROM advance_report_export($1,$2,0)', [
      id,
      job.claim_token,
    ])
    await db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('report-exports','${user}/${id}/0.part'),('report-exports','${user}/${id}/1.part');
      SET ROLE authenticated;`)
    expect(
      (await db.query('SELECT * FROM report_export_download($1)', [id])).rows,
    ).toHaveLength(1)
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(
      1,
    )
    expect(
      (
        await db.query<{ allowed: boolean }>(
          'SELECT report_export_access($1) AS allowed',
          [`${user}/${id}/bad.part`],
        )
      ).rows[0].allowed,
    ).toBe(false)
    await db.exec(
      'RESET ROLE; UPDATE profiles SET premium = false; SET ROLE authenticated',
    )
    await expect(
      db.query('SELECT * FROM report_export_download($1)', [id]),
    ).rejects.toThrow('Premium')
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(
      0,
    )
    await db.exec(
      "RESET ROLE; UPDATE profiles SET premium = true; UPDATE report_export_jobs SET expires_at = now() - interval '1 minute'",
    )
    await expect(
      db.query('SELECT * FROM report_export_download($1)', [id]),
    ).rejects.toThrow('expired')
  })
  it('cancellation revokes access immediately while cleanup is idempotent', async () => {
    await request()
    const job = await claim()
    await db.query('SELECT cancel_report_export($1)', [id])
    expect(
      (await db.query('SELECT * FROM expired_report_exports()')).rows,
    ).toHaveLength(0)
    await expect(
      db.query('SELECT * FROM advance_report_export($1,$2,0)', [
        id,
        job.claim_token,
      ]),
    ).rejects.toThrow('Stale')
    await db.exec(
      "UPDATE report_export_jobs SET lease_until = now() - interval '2 minutes'",
    )
    expect(
      (await db.query('SELECT * FROM expired_report_exports()')).rows,
    ).toHaveLength(1)
    await db.query('SELECT clean_report_export($1)', [id])
    await db.query('SELECT clean_report_export($1)', [id])
    expect(
      (await db.query('SELECT * FROM report_export_rows')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query('SELECT * FROM expired_report_exports()')).rows,
    ).toHaveLength(0)
  })
  it('purges cleaned metadata after seven days even when no new cleanup jobs exist', async () => {
    await request()
    await db.query('SELECT cancel_report_export($1)', [id])
    await db.query('SELECT * FROM expired_report_exports()')
    await db.query('SELECT clean_report_export($1)', [id])
    await db.exec(
      "UPDATE report_export_jobs SET cleaned_at = now() - interval '8 days'",
    )
    await db.query('SELECT * FROM expired_report_exports()')
    expect(
      (await db.query('SELECT * FROM report_export_jobs')).rows,
    ).toHaveLength(0)
  })
})
