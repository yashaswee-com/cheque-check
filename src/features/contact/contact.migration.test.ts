// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb(['20261106030000_contact_messages.sql'])
}, 60000)

afterAll(async () => {
  await db?.close()
})

async function submit(addressHash: string, name = 'Jamie Example') {
  const result = await db.query<{ accepted: boolean }>(
    `SELECT submit_contact_message($1,$2,$3,$4,3,3600) AS accepted`,
    [
      name,
      'jamie@example.test',
      'Please help me with my cheque records.',
      addressHash,
    ],
  )
  return result.rows[0].accepted
}

describe('private contact message migration', () => {
  it('atomically accepts three messages per address per hour and rejects the fourth', async () => {
    const hash = 'a'.repeat(64)
    expect(await submit(hash)).toBe(true)
    expect(await submit(hash)).toBe(true)
    expect(await submit(hash)).toBe(true)
    expect(await submit(hash)).toBe(false)
    expect(
      (
        await db.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM contact_messages',
        )
      ).rows[0].count,
    ).toBe(3)
    expect(await submit('b'.repeat(64))).toBe(true)
  })

  it('rejects invalid bounds and rate-limit configuration', async () => {
    await expect(
      db.query(
        `SELECT submit_contact_message('Name','bad','short','${'c'.repeat(64)}',3,3600)`,
      ),
    ).rejects.toThrow(/Invalid contact submission/)
    await expect(
      db.query(
        `SELECT submit_contact_message('Name','x@y.test','Long enough message','${'c'.repeat(64)}',99,3600)`,
      ),
    ).rejects.toThrow(/Invalid contact submission/)
  })

  it('keeps 10,000 independent client buckets addressable by the composite key', async () => {
    const window = '2026-11-02T00:00:00Z'
    await db.query(
      `INSERT INTO contact_message_rate_limits(address_hash,window_started_at,request_count)
       SELECT lpad(to_hex(client_id),64,'0'),$1::timestamptz,1
       FROM generate_series(1,10000) AS clients(client_id)`,
      [window],
    )

    const result = await db.query<{ request_count: number }>(
      `SELECT request_count FROM contact_message_rate_limits
       WHERE address_hash=$1 AND window_started_at=$2::timestamptz`,
      [
        '0000000000000000000000000000000000000000000000000000000000002710',
        window,
      ],
    )
    expect(result.rows).toEqual([{ request_count: 1 }])

    const plan = await db.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT request_count FROM contact_message_rate_limits
       WHERE address_hash=$1 AND window_started_at=$2::timestamptz`,
      [
        '0000000000000000000000000000000000000000000000000000000000002710',
        window,
      ],
    )
    expect(plan.rows[0]['QUERY PLAN']).toContain(
      'contact_message_rate_limits_pkey',
    )
  })

  it('keeps message and rate-limit records unavailable to authenticated users', async () => {
    await submit('d'.repeat(64))
    expect(
      (
        await asUser<{ count: number }>(
          db,
          '10000000-0000-4000-8000-000000000001',
          'SELECT count(*)::int AS count FROM contact_messages',
        )
      ).rows[0].count,
    ).toBe(0)
    expect(
      (
        await asUser<{ count: number }>(
          db,
          '10000000-0000-4000-8000-000000000001',
          'SELECT count(*)::int AS count FROM contact_message_rate_limits',
        )
      ).rows[0].count,
    ).toBe(0)
    await expect(
      asUser(
        db,
        '10000000-0000-4000-8000-000000000001',
        `INSERT INTO contact_messages(name,email,message)
         VALUES('Intruder','x@y.test','This should not be stored')`,
      ),
    ).rejects.toThrow()
  })
})
