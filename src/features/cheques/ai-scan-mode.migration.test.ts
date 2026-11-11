// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const legacy = '10000000-0000-0000-0000-0000000000e1'
const fresh = '10000000-0000-0000-0000-0000000000e2'
let db: PGlite

beforeAll(async () => {
  db = await createMigratedDb()
  await db.exec(
    `INSERT INTO auth.users(id,email) VALUES('${legacy}','legacy@x.test')`,
  )
  await db.exec(migration('20261111010000_ai_scan_mode.sql'))
  await db.exec(
    `INSERT INTO auth.users(id,email) VALUES('${fresh}','fresh@x.test')`,
  )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

const mode = async (user: string) =>
  (
    await db.query<{ ai_scan_enabled: boolean }>(
      `SELECT ai_scan_enabled FROM profiles WHERE user_id = '${user}'`,
    )
  ).rows[0].ai_scan_enabled

describe('AI Scan Mode database preference', () => {
  it('defaults existing and new profiles to enabled', async () => {
    expect(await mode(legacy)).toBe(true)
    expect(await mode(fresh)).toBe(true)
  })

  it('allows disabling without credits and refuses re-enabling without available credits', async () => {
    await db.exec(
      `UPDATE user_quotas SET used = "limit" WHERE user_id = '${legacy}' AND feature_id = 'ai_scan'`,
    )
    await asUser(
      db,
      legacy,
      `UPDATE profiles SET ai_scan_enabled = false WHERE user_id = '${legacy}'`,
    )
    expect(await mode(legacy)).toBe(false)
    await expect(
      asUser(
        db,
        legacy,
        `UPDATE profiles SET ai_scan_enabled = true WHERE user_id = '${legacy}'`,
      ),
    ).rejects.toMatchObject({ code: '42501' })
    expect(await mode(legacy)).toBe(false)
  })

  it('rejects expired credits, accepts valid credits, and never consumes quota on toggle', async () => {
    await db.exec(
      `UPDATE user_quotas SET used = 0, reset_at = now() - interval '1 day' WHERE user_id = '${legacy}' AND feature_id = 'ai_scan'`,
    )
    await expect(
      asUser(
        db,
        legacy,
        `UPDATE profiles SET ai_scan_enabled = true WHERE user_id = '${legacy}'`,
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      `UPDATE user_quotas SET reset_at = now() + interval '1 day' WHERE user_id = '${legacy}' AND feature_id = 'ai_scan'`,
    )
    await asUser(
      db,
      legacy,
      `UPDATE profiles SET ai_scan_enabled = true WHERE user_id = '${legacy}'`,
    )
    expect(await mode(legacy)).toBe(true)
    const { rows } = await db.query<{ used: number }>(
      `SELECT used FROM user_quotas WHERE user_id = '${legacy}' AND feature_id = 'ai_scan'`,
    )
    expect(rows[0].used).toBe(0)
  })

  it('cannot change another user preference or clear the non-null mode', async () => {
    await asUser(
      db,
      legacy,
      `UPDATE profiles SET ai_scan_enabled = false WHERE user_id = '${fresh}'`,
    )
    expect(await mode(fresh)).toBe(true)
    await expect(
      asUser(
        db,
        legacy,
        `UPDATE profiles SET ai_scan_enabled = null WHERE user_id = '${legacy}'`,
      ),
    ).rejects.toMatchObject({ code: '23502' })
  })
})
