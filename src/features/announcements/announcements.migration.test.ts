// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createMigratedDb } from '@/test/migrated-db'
const user = '10000000-0000-4000-8000-000000000001'
let db: PGlite
beforeAll(async () => {
  db = await createMigratedDb(['20261104010000_developer_announcements.sql'])
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${user}','message@x.test');
    REVOKE ALL ON announcements,announcement_reads FROM authenticated;`)
}, 60000)
afterAll(async () => {
  await db?.close()
})
describe('published developer announcements', () => {
  it('reads latest published message and acknowledges idempotently', async () => {
    const result = await asUser<{ data: { id: string; read: boolean } }>(
      db,
      user,
      'SELECT latest_developer_message() AS data',
    )
    expect(result.rows[0].data.read).toBe(false)
    const id = result.rows[0].data.id
    await asUser(db, user, `SELECT acknowledge_developer_message('${id}')`)
    await asUser(db, user, `SELECT acknowledge_developer_message('${id}')`)
    expect(
      (
        await asUser<{ data: { read: boolean } }>(
          db,
          user,
          'SELECT latest_developer_message() AS data',
        )
      ).rows[0].data.read,
    ).toBe(true)
  })
  it('does not expose drafts, expired announcements or client authoring', async () => {
    await db.exec(
      `INSERT INTO announcements(version,author,content,publish_at) VALUES(2,'Team','{"en":"Future","hi":"भविष्य","hi-en":"Future"}',now()+interval '1 day')`,
    )
    expect(
      (
        await asUser<{ data: { version: number } }>(
          db,
          user,
          'SELECT latest_developer_message() AS data',
        )
      ).rows[0].data.version,
    ).toBe(1)
    await expect(
      asUser(db, user, "UPDATE announcements SET author='Other'"),
    ).rejects.toThrow(/permission/)
  })
})
