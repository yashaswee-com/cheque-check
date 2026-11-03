// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'
import { chequeAnalyticsSchema } from '@/validators/cheque-analytics'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const business = '20000000-0000-4000-8000-000000000001'
const party = '30000000-0000-4000-8000-000000000001'
const legacy = '30000000-0000-4000-8000-000000000002'
const account = '40000000-0000-4000-8000-000000000001'
const bank = '50000000-0000-4000-8000-000000000001'
const savings = '40000000-0000-4000-8000-000000000002'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb([
    '20261031000000_bounded_cheque_reads.sql',
    '20261101060000_published_default_accounts.sql',
    '20261101070000_party_type.sql',
    '20261101080000_six_digit_cheque_numbers.sql',
    '20261102070000_extended_cheque_filters.sql',
    '20261102090000_cheque_analytics.sql',
    '20261108000000_cheque_list_account_filter.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','filter@x.test'),('${other}','other@x.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Business');
    INSERT INTO parties(id,business_id,name,contact,party_type) VALUES
      ('${party}','${business}','Customer','+919876543210','customer'),
      ('${legacy}','${business}','Legacy','+919876543210',NULL);
    INSERT INTO banks(id,name,category) VALUES('${bank}','Test bank','public');
    INSERT INTO accounts(id,business_id,bank_id,account_name,account_number)
      VALUES('${account}','${business}','${bank}','Main','1234'),
      ('${savings}','${business}','${bank}','Savings','5678');
    INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date,deposit_date)
      VALUES('${business}','${party}','${account}','100001',100.25,'Outward','Issued','2026-01-01','2026-02-01'),
      ('${business}','${party}','${account}','100002',200,'Outward','Cleared','2026-01-31','2026-02-28'),
      ('${business}','${legacy}','${account}','100003',0,'Outward','Bounced','2025-12-31',NULL),
      ('${business}','${party}','${savings}','100004',50,'Outward','Issued','2026-03-01',NULL);
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
    expect(Number(result.rows[0].active_count)).toBe(4)
    const next = await page(
      `requested_min_amount := 100.25, requested_limit := 1, requested_offset := 1`,
    )
    expect(next.rows[0].cheque_id).not.toBe(result.rows[0].cheque_id)
  })

  async function analytics(
    from: string,
    to: string,
    user = owner,
    direction = 'All',
  ) {
    const result = await asUser<{ data: unknown }>(
      db,
      user,
      `SELECT cheque_analytics('${business}','2026-02-02',true,'${from}','${to}','${direction}') AS data`,
    )
    return chequeAnalyticsSchema.parse(result.rows[0].data)
  }

  describe('full-schema cheque analytics', () => {
    it('zero-fills daily buckets and totals counts/amounts without fetching cheque rows', async () => {
      const result = await analytics('2026-01-01', '2026-01-31')
      expect(result.granularity).toBe('day')
      expect(result.series).toHaveLength(31)
      expect(result.series[0]).toMatchObject({
        day: '2026-01-01',
        outward_count: 1,
        outward_amount: 100.25,
      })
      expect(result.series[1]).toMatchObject({
        outward_count: 0,
        outward_amount: 0,
      })
      expect(
        result.series.reduce((sum, row) => sum + row.outward_amount, 0),
      ).toBe(300.25)
      expect(
        result.summary.find((row) => row.status === 'Issued'),
      ).toMatchObject({
        cheque_count: 1,
        total_amount: 100.25,
        overdue_count: 1,
        overdue_amount: 100.25,
        today_count: 0,
      })
      expect(
        result.summary.find((row) => row.status === 'Cleared'),
      ).toMatchObject({ overdue_count: 0 })
      expect(result.matching_banks).toBe(1)
      expect(result.banks[0].id).toBe(bank)
    })
    it.each([
      ['2026-01-01', '2026-01-31', 'day'],
      ['2026-01-01', '2026-02-01', 'week'],
      ['2026-01-01', '2026-03-31', 'week'],
      ['2026-01-01', '2026-04-01', 'month'],
    ])(
      'switches grouping at exact inclusive thresholds %s to %s',
      async (from, to, grouping) => {
        expect((await analytics(from, to)).granularity).toBe(grouping)
      },
    )
    it('allows the 10-year boundary, rejects longer/reversed ranges, and keeps tenant isolation', async () => {
      expect((await analytics('2016-01-01', '2026-01-01')).series).toHaveLength(
        121,
      )
      await expect(analytics('2016-01-01', '2026-01-02')).rejects.toThrow(
        'cannot exceed 10 years',
      )
      await expect(analytics('2026-01-02', '2026-01-01')).rejects.toThrow(
        'Invalid analytics request',
      )
      const foreign = await analytics('2026-01-01', '2026-01-31', other)
      expect(foreign.summary).toEqual([])
      expect(foreign.banks).toEqual([])
      expect(
        foreign.series.every(
          (point) => point.outward_count === 0 && point.inward_count === 0,
        ),
      ).toBe(true)
      const inward = await analytics(
        '2026-01-01',
        '2026-01-31',
        owner,
        'Inward',
      )
      expect(inward.summary).toEqual([])
    })
    it('supports the Unknown bank drilldown rather than opening unfiltered cheques', async () => {
      await db.exec(
        `UPDATE accounts SET bank_id = NULL WHERE business_id = '${business}'`,
      )
      expect((await page('requested_unknown_bank := true')).rows).toHaveLength(
        4,
      )
      expect(
        Number(
          (await page(`requested_banks := ARRAY['${bank}']::uuid[]`)).rows[0]
            .matching_count,
        ),
      ).toBe(0)
      const result = await analytics('2026-01-01', '2026-01-31')
      expect(result.banks[0].id).toBeNull()
    })
  })
  it('scopes entity pages to one account and combines it with the shared filters', async () => {
    const scoped = await page(`requested_account := '${savings}'`)
    expect(scoped.rows).toHaveLength(1)
    expect(Number(scoped.rows[0].matching_count)).toBe(1)
    expect(Number(scoped.rows[0].active_count)).toBe(4)
    const main = await page(
      `requested_account := '${account}', requested_party := '${party}'`,
    )
    expect(Number(main.rows[0].matching_count)).toBe(2)
    const none = await page(
      `requested_account := '${savings}', requested_statuses := ARRAY['Cleared']`,
    )
    expect(none.rows[0].cheque_id).toBeNull()
    expect(
      (await page(`requested_account := '${savings}'`, other)).rows[0]
        .cheque_id,
    ).toBeNull()
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
    expect(Number(empty.rows[0].active_count)).toBe(4)
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
