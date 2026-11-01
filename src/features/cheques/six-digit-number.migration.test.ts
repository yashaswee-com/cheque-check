// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const owner = '10000000-0000-0000-0000-0000000000b1'
const business = '20000000-0000-0000-0000-0000000000b1'
const party = '30000000-0000-0000-0000-0000000000b1'
const account = '40000000-0000-0000-0000-0000000000b1'
const ids = {
  valid: '50000000-0000-0000-0000-0000000000b1',
  spaced: '50000000-0000-0000-0000-0000000000b2',
  short: '50000000-0000-0000-0000-0000000000b3',
  clashA: '50000000-0000-0000-0000-0000000000b4',
  clashB: '50000000-0000-0000-0000-0000000000b5',
  draft: '50000000-0000-0000-0000-0000000000b6',
}
let db: PGlite

const row = async (id: string) =>
  (
    await db.query<{ cheque_number: string; cheque_number_legacy: boolean }>(
      `SELECT cheque_number, cheque_number_legacy FROM cheques WHERE id = '${id}'`,
    )
  ).rows[0]

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101060000_published_default_accounts.sql',
    '20261101070000_party_type.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','six@example.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Biz');
    INSERT INTO parties(id,business_id,name,contact) VALUES('${party}','${business}','P','+919876543210');
    INSERT INTO accounts(id,business_id,account_name,account_number) VALUES('${account}','${business}','Main','1');
    INSERT INTO cheques(id,business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date) VALUES
      ('${ids.valid}','${business}','${party}','${account}','000123',10,'Outward','Issued','2026-11-01'),
      ('${ids.spaced}','${business}','${party}','${account}','654 321',10,'Outward','Issued','2026-11-01'),
      ('${ids.short}','${business}','${party}','${account}','12345',10,'Outward','Issued','2026-11-01'),
      ('${ids.clashA}','${business}','${party}','${account}','111-222',10,'Outward','Issued','2026-11-01'),
      ('${ids.clashB}','${business}','${party}','${account}','111 222',10,'Outward','Issued','2026-11-01');
    INSERT INTO cheques(id,business_id,cheque_number,is_draft) VALUES('${ids.draft}','${business}','12',true);
  `)
  // Apply the migration only after legacy data exists, as in production.
  await db.exec(migration('20261101080000_six_digit_cheque_numbers.sql'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('six-digit cheque number migration', () => {
  it('normalises unambiguous separators and flags the rest as legacy', async () => {
    expect(await row(ids.valid)).toEqual({
      cheque_number: '000123',
      cheque_number_legacy: false,
    })
    expect(await row(ids.spaced)).toEqual({
      cheque_number: '654321',
      cheque_number_legacy: false,
    })
    expect(await row(ids.short)).toEqual({
      cheque_number: '12345',
      cheque_number_legacy: true,
    })
    // Two rows that would normalise to the same number are left untouched.
    expect(await row(ids.clashA)).toMatchObject({ cheque_number_legacy: true })
    expect(await row(ids.clashB)).toMatchObject({ cheque_number_legacy: true })
    expect(await row(ids.draft)).toEqual({
      cheque_number: '12',
      cheque_number_legacy: false,
    })
  })

  it('rejects new published cheques without exactly six digits', async () => {
    for (const bad of ['12345', '1234567', '12a456', '123 456']) {
      await expect(
        asUser(
          db,
          owner,
          `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date)
           VALUES('${business}','${party}','${account}','${bad}',1,'Outward','Issued','2026-11-01')`,
        ),
      ).rejects.toThrow(/cheque_number_six_digits/)
    }
    await asUser(
      db,
      owner,
      `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date)
       VALUES('${business}','${party}','${account}','999999',1,'Outward','Issued','2026-11-01')`,
    )
  })

  it('lets drafts hold partial numbers but requires six digits to publish', async () => {
    await expect(
      asUser(
        db,
        owner,
        `UPDATE cheques SET is_draft = false, party_id = '${party}', account_id = '${account}',
          amount = 1, type = 'Outward', status = 'Issued', cheque_date = '2026-11-01' WHERE id = '${ids.draft}'`,
      ),
    ).rejects.toThrow(/cheque_number_six_digits/)
  })

  it('keeps legacy rows updatable until their number changes', async () => {
    await asUser(
      db,
      owner,
      `UPDATE cheques SET status = 'Cleared' WHERE id = '${ids.short}'`,
    )
    expect(await row(ids.short)).toEqual({
      cheque_number: '12345',
      cheque_number_legacy: true,
    })
    await expect(
      asUser(
        db,
        owner,
        `UPDATE cheques SET cheque_number = '1234' WHERE id = '${ids.short}'`,
      ),
    ).rejects.toThrow(/cheque_number_six_digits/)
    await asUser(
      db,
      owner,
      `UPDATE cheques SET cheque_number = '012345' WHERE id = '${ids.short}'`,
    )
    expect(await row(ids.short)).toEqual({
      cheque_number: '012345',
      cheque_number_legacy: false,
    })
  })

  it('does not let clients set or clear the legacy flag directly', async () => {
    await asUser(
      db,
      owner,
      `UPDATE cheques SET cheque_number_legacy = true WHERE id = '${ids.valid}'`,
    )
    expect(await row(ids.valid)).toMatchObject({ cheque_number_legacy: false })
    await asUser(
      db,
      owner,
      `UPDATE cheques SET cheque_number_legacy = false WHERE id = '${ids.clashA}'`,
    )
    expect(await row(ids.clashA)).toMatchObject({ cheque_number_legacy: true })
  })
})
