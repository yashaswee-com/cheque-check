// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const owner = '20000000-0000-0000-0000-0000000000d1'
const stranger = '20000000-0000-0000-0000-0000000000d2'
const business = '20000000-0000-0000-0000-0000000000b1'
const other = '20000000-0000-0000-0000-0000000000b2'
const bank = '20000000-0000-0000-0000-0000000000a9'
const party = '20000000-0000-0000-0000-0000000000c1'
let db: PGlite

interface DraftPage {
  items: { entity: string; draft: Record<string, unknown> }[]
  total: number
  page: number
  page_size: number
}

const page = async (args: string, user = owner) => {
  const result = await asUser(
    db,
    user,
    `SELECT list_drafts_page(${args}) AS page`,
  )
  return (result as { rows: { page: DraftPage }[] }).rows[0].page
}

const names = (result: DraftPage) =>
  result.items.map(
    (item) =>
      (item.draft.name ??
        item.draft.account_name ??
        item.draft.cheque_number) as string,
  )

beforeAll(async () => {
  db = await createMigratedDb()
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','o@x.test'),('${stranger}','s@x.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Biz'),('${other}','${stranger}','Other');
    INSERT INTO banks(id,name,category) VALUES('${bank}','Sunrise Bank','public');
    INSERT INTO parties(business_id,name,contact,is_draft,updated_at) VALUES
      ('${business}','Acme 100%','+919876543210',true,'2026-01-03');
    INSERT INTO parties(id,business_id,name,contact) VALUES
      ('${party}','${business}','Acme Traders','+919876543210');
    INSERT INTO parties(business_id,name,contact,is_draft,updated_at,deleted_at) VALUES
      ('${business}','Deleted','+919876543210',true,'2026-01-09',now());
    INSERT INTO parties(business_id,name,contact,updated_at) VALUES
      ('${business}','Published','+919876543210','2026-01-08');
    INSERT INTO parties(business_id,name,contact,is_draft) VALUES
      ('${other}','Foreign','+919876543210',true);
    INSERT INTO accounts(business_id,bank_id,account_name,is_draft,updated_at) VALUES
      ('${business}','${bank}','Savings_A',true,'2026-01-02');
    INSERT INTO cheques(business_id,party_id,cheque_number,is_draft,updated_at) VALUES
      ('${business}','${party}','123456',true,'2026-01-04');
  `)
  await db.exec(migration('20261110010000_draft_pages.sql'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('list_drafts_page', () => {
  it('returns every live draft of the business, newest first', async () => {
    const result = await page(`'${business}'`)
    expect(result).toMatchObject({ total: 3, page: 0, page_size: 50 })
    expect(result.items.map((item) => item.entity)).toEqual([
      'cheque',
      'party',
      'account',
    ])
  })

  it('embeds the related party, account and bank', async () => {
    const result = await page(`'${business}', ARRAY['cheque','account']`)
    expect(result.items[0].draft).toMatchObject({
      party: { name: 'Acme Traders' },
      account: null,
    })
    expect(result.items[1].draft).toMatchObject({
      bank: { id: bank, name: 'Sunrise Bank' },
    })
  })

  it('filters by type and sorts oldest first', async () => {
    expect(
      names(await page(`'${business}', ARRAY['party','account']`)),
    ).toEqual(['Acme 100%', 'Savings_A'])
    expect(names(await page(`'${business}', NULL, NULL, true`))).toEqual([
      'Savings_A',
      'Acme 100%',
      '123456',
    ])
  })

  it('searches related names and escapes LIKE wildcards', async () => {
    expect(names(await page(`'${business}', NULL, 'acme'`))).toEqual([
      '123456',
      'Acme 100%',
    ])
    expect(names(await page(`'${business}', NULL, '100%'`))).toEqual([
      'Acme 100%',
    ])
    expect(names(await page(`'${business}', NULL, '%'`))).toEqual(['Acme 100%'])
    expect(names(await page(`'${business}', NULL, 's_a'`))).toEqual([
      'Savings_A',
    ])
    expect(names(await page(`'${business}', NULL, 'sunrise'`))).toEqual([
      'Savings_A',
    ])
  })

  it('keeps the total on pages past the last row', async () => {
    const result = await page(`'${business}', NULL, NULL, false, 1`)
    expect(result).toMatchObject({ items: [], total: 3, page: 1 })
  })

  it('hides other businesses through RLS', async () => {
    expect((await page(`'${other}'`)).total).toBe(0)
    expect((await page(`'${other}'`, stranger)).total).toBe(1)
    expect((await page(`'${business}'`, stranger)).total).toBe(0)
  })

  it.each([
    'NULL',
    `'${business}', ARRAY['invoice']`,
    `'${business}', ARRAY['party','party','party','party']`,
    `'${business}', NULL, repeat('x', 101)`,
    `'${business}', NULL, NULL, false, -1`,
    `'${business}', NULL, NULL, false, 200`,
  ])('rejects invalid arguments (%s)', async (args) => {
    await expect(page(args)).rejects.toMatchObject({ code: '22023' })
  })

  it('requires a signed-in user', async () => {
    await expect(
      db.query(`SELECT list_drafts_page('${business}')`),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('draft_counts', () => {
  it('counts live drafts per type', async () => {
    const result = await asUser(
      db,
      owner,
      `SELECT draft_counts('${business}') AS counts`,
    )
    expect((result as { rows: { counts: unknown }[] }).rows[0].counts).toEqual({
      cheque: 1,
      party: 1,
      account: 1,
    })
  })
})
