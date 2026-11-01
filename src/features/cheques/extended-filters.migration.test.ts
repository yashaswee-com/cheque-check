// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const business = '20000000-0000-4000-8000-000000000001'
const party = '30000000-0000-4000-8000-000000000001'
const legacy = '30000000-0000-4000-8000-000000000002'
const account = '40000000-0000-4000-8000-000000000001'
const bank = '50000000-0000-4000-8000-000000000001'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb([
    '20261031000000_bounded_cheque_reads.sql',
    '20261101060000_published_default_accounts.sql',
    '20261101070000_party_type.sql',
    '20261101080000_six_digit_cheque_numbers.sql',
    '20261102070000_extended_cheque_filters.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','filter@x.test'),('${other}','other@x.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Business');
    INSERT INTO parties(id,business_id,name,contact,party_type) VALUES
      ('${party}','${business}','Customer','+919876543210','customer'),
      ('${legacy}','${business}','Legacy','+919876543210',NULL);
    INSERT INTO banks(id,name,category) VALUES('${bank}','Test bank','public');
    INSERT INTO accounts(id,business_id,bank_id,account_name,account_number)
      VALUES('${account}','${business}','${bank}','Main','1234');
    INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date,deposit_date)
      VALUES('${business}','${party}','${account}','100001',100.25,'Outward','Issued','2026-01-01','2026-02-01'),
      ('${business}','${party}','${account}','100002',200,'Outward','Cleared','2026-01-31','2026-02-28'),
      ('${business}','${legacy}','${account}','100003',0,'Outward','Bounced','2025-12-31',NULL);
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

function page(argumentsSql = '', user = owner) {
  return asUser<{
    cheque_id: string | null
    matching_count: number
    active_count: number
  }>(
    db,
    user,
    `SELECT * FROM cheque_list_page('${business}'${argumentsSql ? ', ' + argumentsSql : ''})`,
  )
}
describe('extended server filters', () => {
  it('ANDs independent inclusive ranges, statuses, party type, amount and account bank', async () => {
    const result =
      await page(`requested_from := '2026-01-01', requested_to := '2026-01-31',
      requested_due_from := '2026-02-01', requested_due_to := '2026-02-28',
      requested_statuses := ARRAY['Issued','Cleared'], requested_party_type := 'customer',
      requested_min_amount := 100.25, requested_max_amount := 200,
      requested_banks := ARRAY['${bank}']::uuid[], requested_limit := 1`)
    expect(result.rows).toHaveLength(1)
    expect(Number(result.rows[0].matching_count)).toBe(2)
    expect(Number(result.rows[0].active_count)).toBe(3)
    const next = await page(
      `requested_min_amount := 100.25, requested_limit := 1, requested_offset := 1`,
    )
    expect(next.rows[0].cheque_id).not.toBe(result.rows[0].cheque_id)
  })

  it('supports unclassified parties, zero amounts, open bounds and no-match metadata', async () => {
    const zero = await page(
      `requested_party_type := 'unclassified', requested_max_amount := 0`,
    )
    expect(Number(zero.rows[0].matching_count)).toBe(1)
    const due = await page(`requested_due_from := '2026-02-28'`)
    expect(Number(due.rows[0].matching_count)).toBe(1)
    const empty = await page(`requested_min_amount := 201`)
    expect(empty.rows[0].cheque_id).toBeNull()
    expect(Number(empty.rows[0].matching_count)).toBe(0)
    expect(Number(empty.rows[0].active_count)).toBe(3)
  })
  it('retains RLS and rejects malformed requests at the database boundary', async () => {
    expect((await page('', other)).rows[0].cheque_id).toBeNull()
    for (const args of [
      `requested_from := '2026-02-02', requested_to := '2026-02-01'`,
      `requested_due_from := '2026-02-02', requested_due_to := '2026-02-01'`,
      'requested_min_amount := -1',
      'requested_min_amount := 2, requested_max_amount := 1',
      `requested_min_amount := 'NaN'`,
      `requested_party_type := 'invalid'`,
      `requested_statuses := ARRAY['Cancelled']`,
      `requested_statuses := ARRAY[]::text[]`,
      `requested_banks := ARRAY[]::uuid[]`,
    ])
      await expect(page(args)).rejects.toThrow('Invalid cheque page request')
  })
})
