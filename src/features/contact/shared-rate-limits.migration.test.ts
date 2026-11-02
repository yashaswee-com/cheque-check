// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

let db: PGlite
const user = '10000000-0000-4000-8000-000000000001'
const hash = 'a'.repeat(64)
const submit = (address = hash) =>
  db
    .query<{ accepted: boolean }>(
      `SELECT submit_contact_message('Name','n@example.test','A long enough message',$1,3,3600) AS accepted`,
      [address],
    )
    .then((result) => result.rows[0].accepted)

beforeAll(async () => {
  db = await createMigratedDb(['20261106030000_contact_messages.sql'])
  await db.exec(
    `INSERT INTO auth.users(id,email) VALUES ('${user}','user@test.invalid')`,
  )
  await asUser(
    db,
    user,
    "SELECT consume_api_rate_limit('test-endpoint',2,3600)",
  )
  await submit()
  await submit()
  await db.exec(migration('20261107000000_shared_contact_rate_limits.sql'))
}, 60000)
afterAll(async () => {
  await db?.close()
})

describe('shared authenticated and anonymous rate limit storage', () => {
  it('preserves both existing bucket counts and removes the dedicated table', async () => {
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.contact_message_rate_limits') AS name",
        )
      ).rows,
    ).toEqual([{ name: null }])
    expect(await submit()).toBe(true)
    expect(await submit()).toBe(false)
    expect(
      (
        await asUser<{ allowed: boolean }>(
          db,
          user,
          "SELECT consume_api_rate_limit('test-endpoint',2,3600) AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(true)
    expect(
      (
        await asUser<{ allowed: boolean }>(
          db,
          user,
          "SELECT consume_api_rate_limit('test-endpoint',2,3600) AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false)
  })
  it('atomically accepts only three submissions in a burst and keeps buckets independent', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => submit('b'.repeat(64))),
    )
    expect(results.filter(Boolean)).toHaveLength(3)
    expect(await submit('c'.repeat(64))).toBe(true)
  })
  it('rolls back rate consumption if message storage fails', async () => {
    await db.exec(`CREATE FUNCTION reject_contact_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Storage unavailable'; END $$;
      CREATE TRIGGER reject_contact_test BEFORE INSERT ON contact_messages FOR EACH ROW EXECUTE FUNCTION reject_contact_test()`)
    try {
      await expect(submit('d'.repeat(64))).rejects.toThrow(
        'Storage unavailable',
      )
    } finally {
      await db.exec(
        'DROP TRIGGER reject_contact_test ON contact_messages; DROP FUNCTION reject_contact_test()',
      )
    }
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM api_rate_limits WHERE address_hash=$1',
          ['d'.repeat(64)],
        )
      ).rows,
    ).toEqual([{ count: 0 }])
  })
  it('enforces disjoint subject namespaces and rejects null configuration', async () => {
    for (const sql of [
      `INSERT INTO api_rate_limits(endpoint,window_started_at) VALUES ('test',now())`,
      `INSERT INTO api_rate_limits(user_id,address_hash,endpoint,window_started_at) VALUES ('${user}','${hash}','contact-message',now())`,
      `INSERT INTO api_rate_limits(address_hash,endpoint,window_started_at) VALUES ('${hash}','ocr-cheque',now())`,
      `INSERT INTO api_rate_limits(address_hash,endpoint,window_started_at) VALUES ('not-a-hash','contact-message',now())`,
      `SELECT submit_contact_message('Name','n@example.test','A long enough message',NULL,3,3600)`,
      `SELECT submit_contact_message('Name','n@example.test','A long enough message','${hash}',NULL,3600)`,
    ])
      await expect(db.exec(sql)).rejects.toThrow()
  })
  it('supports 10000 address buckets with indexed lookups', async () => {
    await db.exec(`INSERT INTO api_rate_limits(address_hash,endpoint,window_started_at)
      SELECT lpad(to_hex(n),64,'0'),'contact-message',date_trunc('hour',now()) FROM generate_series(1,10000) AS clients(n);
      ANALYZE api_rate_limits`)
    const { rows } = await db.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT request_count FROM api_rate_limits
      WHERE address_hash=$1 AND endpoint='contact-message' AND window_started_at=date_trunc('hour',now())`,
      ['0'.repeat(60) + '2710'],
    )
    expect(rows.map((row) => row['QUERY PLAN']).join(' ')).toContain(
      'api_rate_limits_address_window_key',
    )
  })
  it('retains user and endpoint scoping and cannot be invoked by anonymous clients', async () => {
    const other = '10000000-0000-4000-8000-000000000002'
    await db.exec(
      `INSERT INTO auth.users(id,email) VALUES ('${other}','other@test.invalid')`,
    )
    expect(
      (
        await asUser<{ allowed: boolean }>(
          db,
          other,
          "SELECT consume_api_rate_limit('test-endpoint',2,3600) AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(true)
    expect(
      (
        await asUser<{ allowed: boolean }>(
          db,
          user,
          "SELECT consume_api_rate_limit('other-endpoint',2,3600) AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(true)
    await expect(
      asUser(db, user, 'SELECT * FROM api_rate_limits'),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(
        db,
        user,
        `SELECT submit_contact_message('Name','n@example.test','A long enough message','${hash}',3,3600)`,
      ),
    ).rejects.toThrow(/permission denied/)
    await db.exec('SET ROLE anon')
    try {
      await expect(db.query('SELECT * FROM api_rate_limits')).rejects.toThrow(
        /permission denied/,
      )
      await expect(
        db.query(
          `SELECT submit_contact_message('Name','n@example.test','A long enough message','${hash}',3,3600)`,
        ),
      ).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('RESET ROLE')
    }
  })
})
