// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '../../src/test/migrated-db'
import {
  ScanCandidatesSchema,
  ScanJobSchema,
} from '../../src/validators/cheque-scan'
import { runScan, type ScanClaim } from '../functions/cheque-ocr/worker'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const business = '20000000-0000-4000-8000-000000000001'
const draft = '30000000-0000-4000-8000-000000000001'
const image = `/api/storage/private-cheque-images/${owner}/front.jpg`
type Job = {
  id: string
  status: string
  credit_state: string
  claim_token?: string
  auto_charge_enabled: boolean
  deadline_at: string
  review_expires_at: string | null
  details: Record<string, unknown> | null
}
let db: PGlite
let key = 0
const details = {
  amount: 1250.5,
  cheque_number: '001234',
  cheque_date: '2026-11-14',
  payee_name: 'Customer',
  account_name: 'Drawer',
  account_number: '00123456789',
  ifsc_code: 'SBIN0001234',
  bank_name: 'State Bank',
}
const reliability = Object.fromEntries(
  Object.keys(details).map((field) => [
    field,
    { level: 'high', reason: 'clear' },
  ]),
)
const rpc = async (sql: string, user = owner) =>
  (await asUser<{ result: Job }>(db, user, `SELECT ${sql} AS result`)).rows[0]
    .result
const start = (requestKey?: string, mode = 'Inward') =>
  rpc(
    `begin_cheque_scan('${image}','${requestKey ?? `40000000-0000-4000-8000-${String(++key).padStart(12, '0')}`}','2026-11-14','${mode}')`,
  )
const claim = async (job: Job) =>
  (
    await db.query<{ result: Job }>('SELECT claim_cheque_scan($1) AS result', [
      job.id,
    ])
  ).rows[0].result
const finish = async (
  job: Job,
  status = 'ready_high',
  result = details,
  scores = reliability,
) =>
  (
    await db.query<{ result: Job }>(
      'SELECT finish_cheque_scan($1,$2,$3,$4,$5) AS result',
      [job.id, job.claim_token, status, result, scores],
    )
  ).rows[0].result
const used = async () =>
  (
    await db.query<{ used: number }>(
      `SELECT used FROM user_quotas WHERE user_id=$1 AND feature_id='ai_scan'`,
      [owner],
    )
  ).rows[0].used

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101100000_ai_model_policies.sql',
    '20261104020000_referrals_and_wallet.sql',
    '20261107010000_product_ai_model_policies.sql',
    '20261111010000_ai_scan_mode.sql',
  ])
  // Only unavailable hosted extensions are stubbed; all lifecycle/accounting SQL is real.
  await db.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE net.calls(body jsonb);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
      RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO net.calls VALUES(body); RETURN 1; END $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
  `)
  await db.exec(migration('20261114010000_durable_cheque_ocr.sql'))
  expect(
    (
      await db.query(
        'SELECT enabled,auto_charge_enabled,daily_spend_limit_micros FROM cheque_scan_config',
      )
    ).rows,
  ).toEqual([
    {
      enabled: false,
      auto_charge_enabled: false,
      daily_spend_limit_micros: 0,
    },
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','ocr@test.invalid'),('${other}','other@test.invalid');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Test business');
    INSERT INTO cheques(id,business_id,is_draft,image_url) VALUES('${draft}','${business}',true,'${image}');
  `)
}, 60_000)
beforeEach(async () => {
  await db.exec(`
    DELETE FROM cheque_scan_entity_intents;
    DELETE FROM cheque_scan_party_banks;
    DELETE FROM cheque_scan_credits;
    DELETE FROM cheque_scan_jobs;
    DELETE FROM cheque_scan_daily_budget;
    DELETE FROM cheque_scan_consents;
    DELETE FROM net.calls;
    DELETE FROM api_rate_limits;
    DELETE FROM vault.decrypted_secrets;
    UPDATE cheque_scan_config SET enabled=true,auto_charge_enabled=false,
      max_in_flight=10,daily_scan_limit=1000,daily_spend_limit_micros=100000000,
      scan_cost_ceiling_micros=100000;
    UPDATE user_quotas SET used=0,"limit"=10,reset_at=NULL WHERE user_id='${owner}' AND feature_id='ai_scan';
    UPDATE profiles SET ai_scan_enabled=true WHERE user_id='${owner}';
    UPDATE cheques SET image_url='${image}',deleted_at=NULL WHERE id='${draft}';
    UPDATE parties SET deleted_at=clock_timestamp() WHERE business_id='${business}' AND deleted_at IS NULL;
    UPDATE accounts SET deleted_at=clock_timestamp() WHERE business_id='${business}' AND deleted_at IS NULL;
  `)
  await rpc("acknowledge_cheque_scan_consent('2026-11-14')")
})
afterAll(async () => {
  await db?.close()
})

describe('durable cheque OCR database contract', () => {
  it('runs the actual durable worker through real RPCs, then accepts and recovers exactly once', async () => {
    const first = await start()
    expect(await used()).toBe(1)
    let activeChecks = 0
    let providerCalls = 0
    const png = new Uint8Array(33)
    png.set([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(png.buffer)
    view.setUint32(8, 13)
    png.set([73, 72, 68, 82], 12)
    view.setUint32(16, 400)
    view.setUint32(20, 200)
    await runScan(first.id, {
      now: Date.now,
      claim: async (id) =>
        (
          await db.query<{ job: ScanClaim }>(
            'SELECT claim_cheque_scan($1) AS job',
            [id],
          )
        ).rows[0].job,
      active: async (job) => {
        activeChecks++
        return (
          await db.query<{ active: boolean }>(
            'SELECT continue_cheque_scan($1,$2) AS active',
            [job.id, job.claim_token],
          )
        ).rows[0].active
      },
      image: async () => png,
      infer: async (_job, _bytes, mediaType) => {
        providerCalls++
        expect(mediaType).toBe('image/png')
        return { document: 'cheque_front', uncertain_fields: [], ...details }
      },
      finish: async (job, result) => {
        await db.query('SELECT finish_cheque_scan($1,$2,$3,$4,$5,$6)', [
          job.id,
          job.claim_token,
          result.status,
          result.details ?? null,
          result.reliability ?? null,
          result.error ?? null,
        ])
      },
    })
    expect(activeChecks).toBe(1)
    expect(providerCalls).toBe(1)
    const ready = ScanJobSchema.parse(await rpc(`read_cheque_scan('${image}')`))
    expect(ready).toMatchObject({
      status: 'ready_partial',
      credit_state: 'reserved',
      details,
    })
    const accepted = ScanJobSchema.parse(
      await rpc(`mutate_cheque_scan('${first.id}','accept')`),
    )
    expect(accepted).toMatchObject({
      status: 'accepted_partial',
      credit_state: 'charged',
    })
    expect(
      ScanJobSchema.parse(
        await rpc(`mutate_cheque_scan('${first.id}','accept')`),
      ),
    ).toEqual(accepted)
    expect(
      ScanJobSchema.parse(await rpc(`read_cheque_scan('${image}')`)),
    ).toEqual(accepted)
    expect(await used()).toBe(1)
  })

  it('parses actual begin, read, mutate, remap and candidate JSON with the application schemas', async () => {
    const first = await start()
    expect(ScanJobSchema.parse(first)).toMatchObject({
      mode: 'Inward',
      status: 'accepted',
      credit_state: 'reserved',
    })
    expect(
      ScanJobSchema.parse(await rpc(`read_cheque_scan('${image}')`)),
    ).toMatchObject({ id: first.id })
    const worker = await claim(first)
    expect(ScanJobSchema.parse(await finish(worker))).toMatchObject({
      status: 'ready_partial',
    })
    const candidates = await rpc(`scan_entity_candidates('${first.id}')`)
    expect(ScanCandidatesSchema.parse(candidates)).toEqual({
      parties: [],
      accounts: [],
    })
    // The form's new mode has deliberately not been persisted to the draft.
    const remapped = await rpc(`remap_cheque_scan('${first.id}','Outward')`)
    expect(ScanJobSchema.parse(remapped)).toMatchObject({ mode: 'Outward' })
    expect(
      ScanJobSchema.parse(
        await rpc(`mutate_cheque_scan('${first.id}','accept')`),
      ),
    ).toMatchObject({
      status: 'accepted_partial',
      credit_state: 'charged',
      mode: 'Outward',
    })
  })

  it('requires owned active draft, consent, opt-in and private reference before reservation', async () => {
    await db.exec('DELETE FROM cheque_scan_consents')
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    await rpc("acknowledge_cheque_scan_consent('2026-11-14')")
    await expect(
      rpc(
        `begin_cheque_scan('https://example.test/x','40000000-0000-4000-8000-000000000999','2026-11-14','Inward')`,
      ),
    ).rejects.toMatchObject({ code: '22023' })
    await expect(rpc(`read_cheque_scan('${image}')`, other)).resolves.toBeNull()
    await db.exec(
      `UPDATE profiles SET ai_scan_enabled=false WHERE user_id='${owner}'`,
    )
    await expect(start()).rejects.toMatchObject({ code: '42501' })
    expect(await used()).toBe(0)
  })

  it('reserves once, snapshots model, enforces one in flight and detects conflicting retries', async () => {
    const requestKey = '40000000-0000-4000-8000-000000000888'
    const first = await start(requestKey)
    expect(first.credit_state).toBe('reserved')
    expect(first.details).toBeNull()
    expect(await start(requestKey)).toEqual(first)
    expect(await used()).toBe(1)
    await expect(start()).rejects.toMatchObject({ code: '53300' })
    await expect(start(requestKey, 'Outward')).rejects.toMatchObject({
      code: '22023',
    })
    const worker = await claim(first)
    expect(worker.claim_token).toBeTruthy()
    expect(worker.auto_charge_enabled).toBe(false)
    expect(worker).toMatchObject({
      id: first.id,
      image_url: image,
      model: 'gpt-4o-mini',
      deadline_at: first.deadline_at,
      credit_state: 'reserved',
      details: null,
      reliability: null,
      error_code: null,
      review_expires_at: null,
    })
    expect(await claim(first)).toBeNull()
    const read = await rpc(`read_cheque_scan('${image}')`)
    expect(read.claim_token).toBeUndefined()
    expect(read.deadline_at).toBe(first.deadline_at)
  })

  it('defaults high output to review and settles partial acceptance exactly once', async () => {
    const first = await start()
    const worker = await claim(first)
    const result = await finish(worker)
    expect(result.status).toBe('ready_partial')
    expect(result.credit_state).toBe('reserved')
    expect(new Date(result.review_expires_at!).getTime()).toBeGreaterThan(
      Date.now(),
    )
    const accepted = await rpc(`mutate_cheque_scan('${first.id}','accept')`)
    expect(accepted.status).toBe('accepted_partial')
    expect(accepted.credit_state).toBe('charged')
    expect(await rpc(`mutate_cheque_scan('${first.id}','accept')`)).toEqual(
      accepted,
    )
    expect((await finish(worker)).status).toBe('accepted_partial')
    expect(await used()).toBe(1)
  })

  it('keeps uncertified clear critical values available for explicit partial verification', async () => {
    const worker = await claim(await start())
    const review = Object.fromEntries(
      Object.keys(details).map((field) => [
        field,
        { level: 'needs_review', reason: 'clear' },
      ]),
    )
    expect(
      (await finish(worker, 'ready_partial', details, review)).status,
    ).toBe('ready_partial')
    expect(
      (await rpc(`mutate_cheque_scan('${worker.id}','accept')`)).credit_state,
    ).toBe('charged')
  })

  it('charges certified high results atomically and cancellation returns actual charged result', async () => {
    await db.exec('UPDATE cheque_scan_config SET auto_charge_enabled=true')
    const worker = await claim(await start())
    expect((await finish(worker)).credit_state).toBe('charged')
    expect(
      (await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)).status,
    ).toBe('ready_high')
    expect(await used()).toBe(1)
  })

  it('does not trust a worker high status or a stale auto-charge snapshot after the setting is disabled', async () => {
    await db.exec('UPDATE cheque_scan_config SET auto_charge_enabled=true')
    const worker = await claim(await start())
    expect(worker.auto_charge_enabled).toBe(true)
    await db.exec('UPDATE cheque_scan_config SET auto_charge_enabled=false')
    const result = await finish(worker, 'ready_high')
    expect(result).toMatchObject({
      status: 'ready_partial',
      credit_state: 'reserved',
    })
    expect(ScanJobSchema.parse(result).status).toBe('ready_partial')
  })

  it('reserves the configured spend ceiling atomically and never reclaims uncertain provider spend on cancellation', async () => {
    await db.exec(
      'UPDATE cheque_scan_config SET daily_spend_limit_micros=100000,scan_cost_ceiling_micros=100000',
    )
    const first = await start()
    expect(
      (
        await db.query(
          'SELECT scans,committed_micros FROM cheque_scan_daily_budget',
        )
      ).rows,
    ).toEqual([{ scans: 1, committed_micros: 100000 }])
    await rpc(`mutate_cheque_scan('${first.id}','cancel')`)
    expect(await used()).toBe(0)
    await expect(start()).rejects.toThrow('SCAN_BUSY')
    await db.exec(
      'UPDATE cheque_scan_config SET daily_spend_limit_micros=200000,daily_scan_limit=1',
    )
    await expect(start()).rejects.toThrow('SCAN_BUSY')
    expect(
      (
        await db.query(
          'SELECT scans,committed_micros FROM cheque_scan_daily_budget',
        )
      ).rows,
    ).toEqual([{ scans: 1, committed_micros: 100000 }])
    const constraints = (
      await db.query<{ definition: string }>(
        `SELECT pg_get_functiondef('public.begin_cheque_scan(text,uuid,text,text)'::regprocedure) AS definition`,
      )
    ).rows[0].definition
    expect(constraints).toContain(
      'cheque_scan_config WHERE singleton FOR UPDATE',
    )
    expect(constraints).toContain("AT TIME ZONE 'UTC')::date FOR UPDATE")
    await expect(
      db.exec('UPDATE cheque_scan_config SET scan_cost_ceiling_micros=0'),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      db.exec('UPDATE cheque_scan_config SET daily_spend_limit_micros=-1'),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('fences tokens and late output after timeout and reconciles on read', async () => {
    const worker = await claim(await start())
    const forged = {
      ...worker,
      claim_token: '50000000-0000-4000-8000-000000000001',
    }
    expect((await finish(forged)).status).toBe('processing')
    await db.query(
      "UPDATE cheque_scan_jobs SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [worker.id],
    )
    expect((await rpc(`read_cheque_scan('${image}')`)).status).toBe('timed_out')
    expect((await finish(worker)).credit_state).toBe('released')
    expect(await used()).toBe(0)
  })

  it('cancels before completion with no charge and idempotent refund', async () => {
    const worker = await claim(await start())
    expect(
      (await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)).credit_state,
    ).toBe('released')
    await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)
    expect((await finish(worker)).status).toBe('cancelled')
    expect(await used()).toBe(0)
  })

  it('allows only service workers with a live token to continue and blocks retry after cancellation', async () => {
    const worker = await claim(await start())
    const allowed = async (token = worker.claim_token) =>
      (
        await db.query<{ allowed: boolean }>(
          'SELECT continue_cheque_scan($1,$2) AS allowed',
          [worker.id, token],
        )
      ).rows[0].allowed
    expect(await allowed()).toBe(true)
    expect(await allowed('50000000-0000-4000-8000-000000000001')).toBe(false)
    await expect(
      rpc(`continue_cheque_scan('${worker.id}','${worker.claim_token}')`),
    ).rejects.toMatchObject({ code: '42501' })
    await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)
    expect(await allowed()).toBe(false)
    expect(await used()).toBe(0)
  })

  it('blocks worker continuation when configuration disables scanning or the source image changes', async () => {
    const worker = await claim(await start())
    await db.exec('UPDATE cheque_scan_config SET enabled=false')
    expect(
      (
        await db.query<{ allowed: boolean }>(
          'SELECT continue_cheque_scan($1,$2) AS allowed',
          [worker.id, worker.claim_token],
        )
      ).rows[0].allowed,
    ).toBe(false)
    await db.exec('UPDATE cheque_scan_config SET enabled=true')
    const next = await claim(await start())
    await db.exec(
      `UPDATE cheques SET image_url='${image}.new' WHERE id='${draft}'`,
    )
    expect(
      (
        await db.query<{ allowed: boolean }>(
          'SELECT continue_cheque_scan($1,$2) AS allowed',
          [next.id, next.claim_token],
        )
      ).rows[0].allowed,
    ).toBe(false)
  })

  it('expires partial review and never refunds or charges a new quota period', async () => {
    const worker = await claim(await start())
    await finish(worker)
    await db.exec(`UPDATE user_quotas SET used=0,"limit"=100,reset_at=now()+interval '30 days' WHERE user_id='${owner}' AND feature_id='ai_scan';
      UPDATE cheque_scan_jobs SET review_expires_at=clock_timestamp()-interval '1 second'`)
    expect(
      (await rpc(`mutate_cheque_scan('${worker.id}','accept')`)).status,
    ).toBe('expired_review')
    expect(await used()).toBe(0)
    expect((await rpc(`read_cheque_scan('${image}')`)).credit_state).toBe(
      'released',
    )
  })

  it('does not release into a reset with the same nullable reset_at', async () => {
    const first = await start()
    await db.exec(`UPDATE user_quotas SET used=0 WHERE user_id='${owner}' AND feature_id='ai_scan';
      UPDATE user_quotas SET used=4 WHERE user_id='${owner}' AND feature_id='ai_scan'`)
    await rpc(`mutate_cheque_scan('${first.id}','cancel')`)
    expect(await used()).toBe(4)
  })

  it('charges an old partial reservation without debiting a replacement quota period', async () => {
    const worker = await claim(await start())
    await finish(worker)
    await db.exec(
      `UPDATE user_quotas SET used=0,reset_at=now()+interval '30 days' WHERE user_id='${owner}' AND feature_id='ai_scan'`,
    )
    expect(
      (await rpc(`mutate_cheque_scan('${worker.id}','accept')`)).credit_state,
    ).toBe('charged')
    expect(await used()).toBe(0)
  })

  it('releases abandoned processing independently and honors emergency kill switch', async () => {
    const worker = await claim(await start())
    await db.exec(
      'UPDATE cheque_scan_config SET enabled=false; SELECT recover_cheque_scans()',
    )
    expect((await finish(worker)).status).toBe('cancelled')
    expect(await used()).toBe(0)
  })

  it('supersedes changed image references before result commit', async () => {
    const worker = await claim(await start())
    await db.exec(
      `UPDATE cheques SET image_url='${image}.new' WHERE id='${draft}'`,
    )
    expect((await finish(worker)).status).toBe('superseded')
    expect(await used()).toBe(0)
  })

  it('rejects all-null/invalid success and leaves unusable output uncharged', async () => {
    const worker = await claim(await start())
    await expect(
      finish(worker, 'ready_high', { ...details, cheque_number: '123' }),
    ).rejects.toThrow()
    const unusable = {
      ...reliability,
      ...Object.fromEntries(
        ['amount', 'cheque_number', 'cheque_date'].map((field) => [
          field,
          { level: 'unusable', reason: 'missing' },
        ]),
      ),
    }
    expect(
      (
        await finish(
          worker,
          'ready_partial',
          {
            ...details,
            amount: null,
            cheque_number: null,
            cheque_date: null,
          } as unknown as typeof details,
          unusable,
        )
      ).status,
    ).toBe('unusable')
    expect(await used()).toBe(0)
  })

  it('rejects kill switch, exhausted credits and daily spend before acceptance', async () => {
    await db.exec('UPDATE cheque_scan_config SET enabled=false')
    await expect(start()).rejects.toMatchObject({ code: '55000' })
    await db.exec(
      'UPDATE cheque_scan_config SET enabled=true,daily_spend_limit_micros=1',
    )
    await expect(start()).rejects.toMatchObject({ code: '53300' })
    await db.exec(
      'UPDATE cheque_scan_config SET daily_spend_limit_micros=100000000',
    )
    await db.exec(
      `UPDATE user_quotas SET used="limit" WHERE user_id='${owner}' AND feature_id='ai_scan'`,
    )
    await expect(start()).rejects.toMatchObject({ code: '53400' })
    expect(
      (await db.query('SELECT id FROM cheque_scan_jobs')).rows,
    ).toHaveLength(0)
  })

  it('enforces the configured global capacity across different owners', async () => {
    const secondBusiness = '20000000-0000-4000-8000-000000000002'
    const secondImage = `/api/storage/private-cheque-images/${other}/front.jpg`
    await db.exec(`INSERT INTO businesses(id,user_id,name) VALUES('${secondBusiness}','${other}','Other business');
      INSERT INTO cheques(business_id,is_draft,image_url) VALUES('${secondBusiness}',true,'${secondImage}');
      UPDATE cheque_scan_config SET max_in_flight=1`)
    await start()
    await rpc("acknowledge_cheque_scan_consent('2026-11-14')", other)
    await expect(
      rpc(
        `begin_cheque_scan('${secondImage}','40000000-0000-4000-8000-000000000666','2026-11-14','Inward')`,
        other,
      ),
    ).rejects.toMatchObject({ code: '53300' })
    expect(
      (await db.query('SELECT id FROM cheque_scan_jobs')).rows,
    ).toHaveLength(1)
  })

  it('dispatches durably using Vault and independent recovery without a new deadline', async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES('project_url','http://localhost'),('service_role_key','test-only')`,
    )
    const first = await start()
    expect((await db.query('SELECT body FROM net.calls')).rows).toEqual([
      { body: { job_id: first.id } },
    ])
    await db.exec('SELECT recover_cheque_scans()')
    expect((await db.query('SELECT body FROM net.calls')).rows).toHaveLength(2)
    await claim(first)
    await db.exec('SELECT recover_cheque_scans()')
    expect((await db.query('SELECT body FROM net.calls')).rows).toHaveLength(2)
    expect((await rpc(`read_cheque_scan('${image}')`)).deadline_at).toBe(
      first.deadline_at,
    )
  })

  it('protects worker RPCs, private tables and other-owner mutations', async () => {
    const first = await start()
    await expect(rpc(`claim_cheque_scan('${first.id}')`)).rejects.toMatchObject(
      { code: '42501' },
    )
    await expect(rpc(`scan_job_json('${first.id}')`)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      rpc(`mutate_cheque_scan('${first.id}','cancel')`, other),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(db, owner, 'SELECT * FROM cheque_scan_party_banks'),
    ).rejects.toMatchObject({ code: '42501' })
    for (const table of [
      'cheque_scan_jobs',
      'cheque_scan_credits',
      'cheque_scan_consents',
      'cheque_scan_daily_budget',
      'cheque_scan_config',
      'cheque_scan_entity_intents',
      'cheque_scan_party_banks',
    ]) {
      await expect(
        asUser(
          db,
          owner,
          `UPDATE ${table} SET ${table === 'cheque_scan_config' ? 'enabled=true' : table === 'cheque_scan_daily_budget' ? 'scans=0' : table === 'cheque_scan_consents' ? "version='2026-11-14'" : table === 'cheque_scan_jobs' ? "status='ready_high'" : table === 'cheque_scan_credits' ? "state='charged'" : table === 'cheque_scan_entity_intents' ? "kind='party'" : "account_number='12345678'"} WHERE false`,
        ),
      ).rejects.toMatchObject({ code: '42501' })
    }
  })

  it('fences simultaneously submitted claims and completions with database transaction guards', async () => {
    const first = await start()
    // PGlite serializes connection transactions; this exercises concurrent callers,
    // not independent PostgreSQL backends or MVCC lock contention.
    const claims = await Promise.all([claim(first), claim(first), claim(first)])
    const winners = claims.filter(Boolean)
    expect(winners).toHaveLength(1)
    const completed = await Promise.all([
      finish(winners[0]),
      finish(winners[0]),
    ])
    expect(completed[0]).toEqual(completed[1])
    expect(await used()).toBe(1)
    const { rows } = await db.query(
      'SELECT state,count(*)::int AS count FROM cheque_scan_credits GROUP BY state',
    )
    expect(rows).toEqual([{ state: 'reserved', count: 1 }])
    await expect(
      db.exec(`INSERT INTO cheque_scan_jobs
      SELECT (jsonb_populate_record(NULL::cheque_scan_jobs,
        to_jsonb(j)||jsonb_build_object('id',gen_random_uuid(),'request_key',gen_random_uuid(),'status','accepted'))).*
      FROM cheque_scan_jobs j WHERE j.id='${first.id}';
      INSERT INTO cheque_scan_jobs
      SELECT (jsonb_populate_record(NULL::cheque_scan_jobs,
        to_jsonb(j)||jsonb_build_object('id',gen_random_uuid(),'request_key',gen_random_uuid(),'status','accepted'))).*
      FROM cheque_scan_jobs j WHERE j.id='${first.id}';`),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('clears extracted results after seven days and job metadata after thirty without losing accounting or created entities', async () => {
    const requestKey = '40000000-0000-4000-8000-000000000555'
    const worker = await claim(await start(requestKey))
    await finish(worker)
    const party = await rpc(
      `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
    )
    await rpc(`confirm_scan_party('${worker.id}','${party.id}')`)
    await rpc(`mutate_cheque_scan('${worker.id}','accept')`)
    await db.query(
      "UPDATE cheque_scan_jobs SET created_at=clock_timestamp()-interval '8 days' WHERE id=$1",
      [worker.id],
    )
    await db.exec('SELECT cleanup_cheque_scans()')
    expect((await rpc(`read_cheque_scan('${image}')`)).details).toBeNull()
    expect(
      (await db.query('SELECT state FROM cheque_scan_credits')).rows,
    ).toEqual([{ state: 'charged' }])
    await db.query(
      "UPDATE cheque_scan_jobs SET created_at=clock_timestamp()-interval '31 days' WHERE id=$1",
      [worker.id],
    )
    await db.exec('SELECT recover_cheque_scans()')
    expect(
      (await db.query('SELECT id FROM cheque_scan_jobs')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query('SELECT state FROM cheque_scan_credits')).rows,
    ).toEqual([{ state: 'charged' }])
    expect(
      (await db.query('SELECT source_job FROM cheque_scan_party_banks')).rows,
    ).toEqual([{ source_job: null }])
    expect(
      (await db.query('SELECT id FROM parties WHERE id=$1', [party.id])).rows,
    ).toHaveLength(1)
    await expect(start(requestKey)).rejects.toThrow('SCAN_NOT_READY')
    expect(await used()).toBe(1)
  })

  it('rejects malformed or oversized service-role output without persisting result data', async () => {
    const worker = await claim(await start())
    for (const [result, scores] of [
      [{ ...details, account_name: { injected: true } }, reliability],
      [{ ...details, account_name: 'X'.repeat(201) }, reliability],
      [{ ...details, extra: 'unexpected' }, reliability],
      [details, { ...reliability, extra: { level: 'high', reason: 'clear' } }],
      [
        details,
        {
          ...reliability,
          amount: { level: 'high', reason: 'clear', extra: true },
        },
      ],
      [
        details,
        { ...reliability, amount: { level: 'high', reason: 'uncertain' } },
      ],
    ]) {
      await expect(
        finish(
          worker,
          'ready_high',
          result as typeof details,
          scores as typeof reliability,
        ),
      ).rejects.toThrow()
    }
    expect((await rpc(`read_cheque_scan('${image}')`)).details).toBeNull()
    await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)
    expect(await used()).toBe(0)
  })

  it('remaps completed facts without re-inference or another credit and preserves start idempotency', async () => {
    const requestKey = '40000000-0000-4000-8000-000000000777'
    const first = await start(requestKey)
    await expect(
      rpc(`remap_cheque_scan('${first.id}','Outward')`),
    ).rejects.toThrow(/SCAN_NOT_READY/)
    const worker = await claim(first)
    await finish(worker)
    const remapped = await rpc(`remap_cheque_scan('${first.id}','Outward')`)
    expect(remapped).toMatchObject({
      mode: 'Outward',
      details,
      credit_state: 'reserved',
    })
    expect(await start(requestKey)).toEqual(remapped)
    expect(await used()).toBe(1)
    await expect(
      rpc(`remap_cheque_scan('${first.id}','Inward')`, other),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('does not expose stale completed facts through entity mutations after image replacement', async () => {
    const worker = await claim(await start())
    await finish(worker)
    await rpc(`mutate_cheque_scan('${worker.id}','accept')`)
    await db.exec(
      `UPDATE cheques SET image_url='${image}.new' WHERE id='${draft}'`,
    )
    await expect(
      rpc(
        `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
      ),
    ).rejects.toThrow(/IMAGE_NOT_FOUND/)
    await expect(rpc(`scan_entity_candidates('${worker.id}')`)).rejects.toThrow(
      /IMAGE_NOT_FOUND/,
    )
  })

  it('creates parties with real contacts, warns on duplicates and is idempotent', async () => {
    const worker = await claim(await start())
    await finish(worker)
    await expect(
      rpc(`create_scan_entity('${worker.id}','party')`),
    ).rejects.toThrow(/CONTACT_REQUIRED/)
    const created = await rpc(
      `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
    )
    expect(
      await rpc(
        `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
      ),
    ).toMatchObject({ id: created.id, created: false })
    await rpc(`confirm_scan_party('${worker.id}','${created.id}')`)
    expect(
      (await db.query('SELECT account_number FROM cheque_scan_party_banks'))
        .rows,
    ).toEqual([{ account_number: '00123456789' }])
    const next = await claim(await start())
    await finish(next)
    const candidates = await rpc(`scan_entity_candidates('${next.id}')`)
    expect(ScanCandidatesSchema.safeParse(candidates).success).toBe(true)
    expect(candidates).toMatchObject({
      parties: [{ id: created.id, score: 1 }],
    })
    await expect(
      rpc(
        `create_scan_entity('${next.id}','party',NULL,false,'+919876543210')`,
      ),
    ).rejects.toThrow('DUPLICATE_ENTITY')
    expect(
      await rpc(
        `create_scan_entity('${next.id}','party',NULL,true,'+919876543210')`,
      ),
    ).toMatchObject({ created: true })
    await expect(
      rpc(`remap_cheque_scan('${next.id}','Outward')`),
    ).rejects.toThrow(/SCAN_NOT_READY/)
    await expect(
      rpc(`create_scan_entity('${next.id}','account')`),
    ).rejects.toThrow(/manual selection/)
  })

  it('retains explicitly created parties if the partial scan is subsequently cancelled', async () => {
    const worker = await claim(await start())
    await finish(worker)
    const created = await rpc(
      `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
    )
    await rpc(`mutate_cheque_scan('${worker.id}','cancel')`)
    expect(await used()).toBe(0)
    expect(
      (
        await db.query(
          'SELECT id,contact,deleted_at FROM parties WHERE id=$1',
          [created.id],
        )
      ).rows,
    ).toEqual([{ id: created.id, contact: '+919876543210', deleted_at: null }])
  })

  it('throws safe duplicate errors without creation and rechecks under the business lock', async () => {
    await db.exec(
      `INSERT INTO parties(business_id,name,contact) VALUES('${business}','Drawer','+919876543212')`,
    )
    const worker = await claim(await start())
    await finish(worker)
    await expect(
      rpc(
        `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
      ),
    ).rejects.toThrow('DUPLICATE_ENTITY')
    await db.exec(
      `INSERT INTO parties(business_id,name,contact) VALUES('${business}','Drawer','+919876543211')`,
    )
    await expect(
      rpc(
        `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
      ),
    ).rejects.toThrow('DUPLICATE_ENTITY')
    expect(
      await rpc(
        `create_scan_entity('${worker.id}','party',NULL,true,'+919876543210')`,
      ),
    ).toMatchObject({ created: true })
  })

  it('creates only issuing business accounts and reports ambiguity instead of an automatic exact match', async () => {
    const bank = '60000000-0000-4000-8000-000000000001'
    await db.exec(`INSERT INTO banks(id,name) VALUES('${bank}','Test bank')`)
    const worker = await claim(await start(undefined, 'Outward'))
    await finish(worker)
    const created = await rpc(
      `create_scan_entity('${worker.id}','account','${bank}')`,
    )
    expect(created).toMatchObject({ kind: 'account', created: true })
    expect(await rpc(`scan_entity_candidates('${worker.id}')`)).toMatchObject({
      accounts: [{ id: created.id, exact: true, score: 1 }],
    })
    expect(
      ScanCandidatesSchema.safeParse(
        await rpc(`scan_entity_candidates('${worker.id}')`),
      ).success,
    ).toBe(true)
    await db.exec(`INSERT INTO accounts(business_id,account_name,account_number,ifsc_code,bank_id)
      VALUES('${business}','Other drawer','00123456789','SBIN0001234','${bank}')`)
    const result = (await rpc(
      `scan_entity_candidates('${worker.id}')`,
    )) as unknown as {
      accounts: { exact: boolean }[]
    }
    expect(result.accounts).toHaveLength(2)
    expect(result.accounts.every((account) => !account.exact)).toBe(true)
    const party = await rpc(
      `create_scan_entity('${worker.id}','party',NULL,false,'+919876543210')`,
    )
    await rpc(`confirm_scan_party('${worker.id}','${party.id}')`)
    expect(
      (await db.query('SELECT * FROM cheque_scan_party_banks')).rows,
    ).toHaveLength(0)
  })

  it('permits duplicate publication only after a same-scan explicit confirmation and derives flags server-side', async () => {
    const party = '71000000-0000-4000-8000-000000000001'
    const account = '72000000-0000-4000-8000-000000000001'
    const target = '73000000-0000-4000-8000-000000000001'
    const targetImage = `/api/storage/private-cheque-images/${owner}/duplicate.jpg`
    await db.exec(`
      INSERT INTO user_entitlements(user_id,feature_id,status,valid_until)
        VALUES('${owner}','lifetime_premium','active',NULL);
      INSERT INTO parties(id,business_id,name,contact) VALUES('${party}','${business}','Duplicate customer','+919876543210');
      INSERT INTO accounts(id,business_id,account_name,account_number) VALUES('${account}','${business}','Deposit account','99887766');
      INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,cheque_date,type,status)
        VALUES('${business}','${party}','${account}','001234',100,'2026-11-14','Inward','Received');
      INSERT INTO cheques(id,business_id,is_draft,image_url)
        VALUES('${target}','${business}',true,'${targetImage}');
    `)
    const first = await rpc(
      `begin_cheque_scan('${targetImage}','74000000-0000-4000-8000-000000000001','2026-11-14','Inward')`,
    )
    await finish(await claim(first))
    const publish = `UPDATE cheques SET is_draft=false,party_id='${party}',account_id='${account}',
      cheque_number='001234',amount=100,cheque_date='2026-11-14',type='Inward',status='Received',
      scan_duplicate_override=true WHERE id='${target}'`
    await expect(asUser(db, owner, publish)).rejects.toMatchObject({
      code: '23505',
    })
    await expect(
      rpc(`confirm_scan_duplicate('${first.id}','${account}','001234')`, other),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      rpc(`confirm_scan_duplicate('${first.id}','${account}','001235')`),
    ).rejects.toThrow('SCAN_NOT_READY')
    await expect(
      rpc(
        `confirm_scan_duplicate('${first.id}','72000000-0000-4000-8000-000000000099','001234')`,
      ),
    ).rejects.toMatchObject({ code: '42501' })
    expect(
      await rpc(`confirm_scan_duplicate('${first.id}','${account}','001234')`),
    ).toMatchObject({
      confirmed: true,
      draft_id: target,
      account_id: account,
      cheque_number: '001234',
    })
    await expect(
      asUser(
        db,
        owner,
        'UPDATE cheque_scan_duplicate_confirmations SET expires_at=now()',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      "UPDATE cheque_scan_duplicate_confirmations SET expires_at=clock_timestamp()-interval '1 second'",
    )
    await expect(asUser(db, owner, publish)).rejects.toMatchObject({
      code: '23505',
    })
    await rpc(`confirm_scan_duplicate('${first.id}','${account}','001234')`)
    // The client cannot choose the flag: publication succeeds even when it sends false.
    await asUser(
      db,
      owner,
      publish.replace(
        'scan_duplicate_override=true',
        'scan_duplicate_override=false',
      ),
    )
    expect(
      (
        await db.query<{ scan_duplicate_override: boolean }>(
          'SELECT scan_duplicate_override FROM cheques WHERE id=$1',
          [target],
        )
      ).rows[0].scan_duplicate_override,
    ).toBe(true)
    await asUser(
      db,
      owner,
      `UPDATE cheques SET notes='Retained duplicate',scan_duplicate_override=false WHERE id='${target}'`,
    )
    expect(
      (
        await db.query<{ scan_duplicate_override: boolean }>(
          'SELECT scan_duplicate_override FROM cheques WHERE id=$1',
          [target],
        )
      ).rows[0].scan_duplicate_override,
    ).toBe(true)
    await asUser(
      db,
      owner,
      `UPDATE cheques SET cheque_number='001235',scan_duplicate_override=true WHERE id='${target}'`,
    )
    expect(
      (
        await db.query<{ scan_duplicate_override: boolean }>(
          'SELECT scan_duplicate_override FROM cheques WHERE id=$1',
          [target],
        )
      ).rows[0].scan_duplicate_override,
    ).toBe(false)
    // A client flag cannot grant duplicate permission to a different manual record.
    await expect(
      asUser(
        db,
        owner,
        `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,
      amount,cheque_date,type,status,scan_duplicate_override)
      VALUES('${business}','${party}','${account}','001234',100,'2026-11-14','Inward','Received',true)`,
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('ranks bounded edit-distance suggestions without treating fuzzy names as identity', async () => {
    await db.exec(`
      INSERT INTO parties(business_id,name,contact) VALUES
        ('${business}','Drawar','+919876543210'),
        ('${business}','Drawer','+919876543211'),
        ('${business}','Drawer','+919876543212'),
        ('${business}','Unrelated enterprise','+919876543213');
      INSERT INTO accounts(business_id,account_name,account_number) VALUES
        ('${business}','Custmer','887766554433'),
        ('${business}','Unrelated institution','112233445566');
    `)
    const worker = await claim(await start())
    await finish(worker)
    const result = ScanCandidatesSchema.parse(
      await rpc(`scan_entity_candidates('${worker.id}')`),
    )
    expect(result.parties.map((p) => p.name)).toEqual([
      'Drawer',
      'Drawer',
      'Drawar',
    ])
    expect(result.parties[0].score).toBe(result.parties[1].score)
    expect(result.parties[2]).toMatchObject({ reason: 'similar_name' })
    expect(result.parties[2].score).toBeLessThan(result.parties[0].score)
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({
      name: 'Custmer · ••••4433',
      exact: false,
      reason: 'similar_name',
    })
    expect(JSON.stringify(result)).not.toContain('887766554433')
    await db.exec(`INSERT INTO parties(business_id,name,contact)
      SELECT '${business}','Drawer','+919876543210' FROM generate_series(1,8)`)
    expect(
      ScanCandidatesSchema.parse(
        await rpc(`scan_entity_candidates('${worker.id}')`),
      ).parties,
    ).toHaveLength(5)
  })

  it('preserves original scripts in suggested names and never transliterates as identity', async () => {
    await db.exec(`INSERT INTO parties(business_id,name,contact) VALUES
      ('${business}','राम कुमार','+919876543210'),('${business}','Ram Kumar','+919876543211')`)
    const worker = await claim(await start())
    await finish(worker, 'ready_partial', {
      ...details,
      account_name: 'राम कुमार',
    })
    const result = ScanCandidatesSchema.parse(
      await rpc(`scan_entity_candidates('${worker.id}')`),
    )
    expect(result.parties).toHaveLength(1)
    expect(result.parties[0]).toMatchObject({
      name: 'राम कुमार',
      reason: 'normalized_name',
      score: 0.8,
    })
    const similarity = (
      await db.query<{ score: number }>(
        `SELECT scan_name_similarity(repeat('a',10000),repeat('a',80))::float8 AS score`,
      )
    ).rows[0].score
    expect(similarity).toBe(1)
  })
})
