// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const owner = '10000000-0000-0000-0000-0000000000c1'
const business = '20000000-0000-0000-0000-0000000000c1'
const party = '30000000-0000-0000-0000-0000000000c1'
const account = '40000000-0000-0000-0000-0000000000c1'
const cheque = '50000000-0000-0000-0000-0000000000c1'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101060000_published_default_accounts.sql',
    '20261101070000_party_type.sql',
  ])

  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES('${owner}', 'audit@example.test');
    INSERT INTO businesses(id, user_id, name) VALUES('${business}', '${owner}', 'Audit Biz');
    INSERT INTO parties(id, business_id, name, contact) VALUES('${party}', '${business}', 'Party A', '+919999999999');
    INSERT INTO accounts(id, business_id, account_name, account_number) VALUES('${account}', '${business}', 'Main', '123456');
  `)

  await db.exec(migration('20261111000000_cheque_audit_log.sql'))

  await asUser(
    db,
    owner,
    `INSERT INTO cheques(id, business_id, party_id, account_id, cheque_number, amount, type, status, cheque_date)
      VALUES('${cheque}', '${business}', '${party}', '${account}', '123456', 5000, 'Outward', 'Issued', '2026-11-01');`,
  )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('cheque audit log migration', () => {
  it('records entity creation and updates as append-only timeline entries', async () => {
    const created = await db.query<{ event_type: string; changes: object }>(
      `SELECT event_type, changes FROM cheque_audit_events WHERE cheque_id = '${cheque}' ORDER BY created_at ASC`,
    )

    expect(created.rows[0]).toMatchObject({ event_type: 'created' })
    expect(created.rows[0].changes).toEqual([
      { field: 'record', before: null, after: 'created' },
    ])

    await asUser(
      db,
      owner,
      `UPDATE cheques SET status = 'Cleared', notes = 'Approved by bank' WHERE id = '${cheque}'`,
    )

    const updates = await db.query<{ event_type: string; changes: object }>(
      `SELECT event_type, changes FROM cheque_audit_events WHERE cheque_id = '${cheque}' ORDER BY created_at ASC`,
    )

    expect(updates.rows.map((row) => row.event_type)).toContain(
      'status_changed',
    )
    expect(updates.rows.some((row) => row.event_type === 'updated')).toBe(true)

    const latest = updates.rows.at(-1)
    expect(latest).toMatchObject({ event_type: 'updated' })
  })

  it('blocks direct edits to the audit log', async () => {
    await expect(
      asUser(
        db,
        owner,
        `INSERT INTO cheque_audit_events(cheque_id, business_id, actor_kind, event_type, changes)
          VALUES('${cheque}', '${business}', 'user', 'updated', '[]')`,
      ),
    ).rejects.toThrow()

    await expect(
      asUser(
        db,
        owner,
        `UPDATE cheque_audit_events SET event_type = 'deleted' WHERE cheque_id = '${cheque}'`,
      ),
    ).rejects.toThrow()
  })
})
