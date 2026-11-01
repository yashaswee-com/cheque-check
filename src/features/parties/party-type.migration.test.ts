// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const owner = '10000000-0000-0000-0000-0000000000a1'
const business = '20000000-0000-0000-0000-0000000000a1'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101060000_published_default_accounts.sql',
    '20261101070000_party_type.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${owner}','pt@example.test');
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Biz');
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('party_type migration', () => {
  it('keeps existing parties unclassified and accepts only the closed choices', async () => {
    await asUser(
      db,
      owner,
      `INSERT INTO parties(business_id,name,contact) VALUES('${business}','Legacy','+919876543210')`,
    )
    const legacy = await db.query<{ party_type: string | null }>(
      `SELECT party_type FROM parties WHERE name = 'Legacy'`,
    )
    expect(legacy.rows).toEqual([{ party_type: null }])

    for (const type of ['customer', 'supplier', 'vendor']) {
      await asUser(
        db,
        owner,
        `INSERT INTO parties(business_id,name,contact,party_type) VALUES('${business}','${type}','+919876543210','${type}')`,
      )
    }
    await expect(
      asUser(
        db,
        owner,
        `INSERT INTO parties(business_id,name,contact,party_type) VALUES('${business}','Bad','+919876543210','landlord')`,
      ),
    ).rejects.toThrow()
  })

  it('filters by type through the partial business/type index', async () => {
    const { rows } = await asUser<{ name: string }>(
      db,
      owner,
      `SELECT name FROM parties WHERE business_id = '${business}' AND party_type = 'supplier'
        AND deleted_at IS NULL AND is_draft = false`,
    )
    expect(rows).toEqual([{ name: 'supplier' }])
    const index = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'parties_business_party_type_idx'`,
    )
    expect(index.rows[0].indexdef).toMatch(/business_id, party_type/)
    expect(index.rows[0].indexdef).toMatch(/deleted_at IS NULL/)
  })
})
