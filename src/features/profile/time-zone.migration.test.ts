// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

const legacy = '10000000-0000-0000-0000-0000000000f1'
const fresh = '10000000-0000-0000-0000-0000000000f2'
let db: PGlite

const zone = async (user: string) =>
  (
    await db.query<{ time_zone: string | null }>(
      `SELECT time_zone FROM profiles WHERE user_id = '${user}'`,
    )
  ).rows[0]?.time_zone

beforeAll(async () => {
  db = await createMigratedDb()
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${legacy}','legacy@x.test');
    UPDATE profiles SET time_zone = 'Mars/Olympus' WHERE user_id = '${legacy}';
  `)
  await db.exec(migration('20261110000000_profile_time_zone_valid.sql'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('profile time zone validation', () => {
  it('keeps existing values and still allows unrelated profile updates', async () => {
    await asUser(
      db,
      legacy,
      `UPDATE profiles SET currency = '$' WHERE user_id = '${legacy}'`,
    )
    expect(await zone(legacy)).toBe('Mars/Olympus')
  })

  it.each(['', '   ', 'Mars/Phobos', 'asia/kolkata', '+05:30'])(
    'rejects %j with a field-specific error',
    async (value) => {
      await expect(
        asUser(
          db,
          legacy,
          `UPDATE profiles SET time_zone = '${value}' WHERE user_id = '${legacy}'`,
        ),
      ).rejects.toMatchObject({ code: '22023', message: 'invalid_time_zone' })
    },
  )

  it('rejects clearing the time zone', async () => {
    await expect(
      asUser(
        db,
        legacy,
        `UPDATE profiles SET time_zone = NULL WHERE user_id = '${legacy}'`,
      ),
    ).rejects.toMatchObject({ code: '22023' })
  })

  it('accepts IANA names and new profiles get the default zone', async () => {
    await asUser(
      db,
      legacy,
      `UPDATE profiles SET time_zone = 'Asia/Kolkata' WHERE user_id = '${legacy}'`,
    )
    expect(await zone(legacy)).toBe('Asia/Kolkata')
    await db.exec(
      `INSERT INTO auth.users(id,email) VALUES('${fresh}','fresh@x.test')`,
    )
    expect(await zone(fresh)).toBe('UTC')
  })
})
