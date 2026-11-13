// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMigratedDb, migration } from '@/test/migrated-db'

let db: PGlite
const optedIn = '10000000-0000-0000-0000-0000000000a1'
const optedOut = '10000000-0000-0000-0000-0000000000a2'
const fresh = '10000000-0000-0000-0000-0000000000a3'

beforeAll(async () => {
  db = await createMigratedDb()
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES
      ('${optedIn}','opted-in@x.test'), ('${optedOut}','opted-out@x.test');
    UPDATE profiles SET party_sms_enabled = FALSE WHERE user_id = '${optedOut}';
  `)
  await db.exec(migration('20261114000000_party_sms_opt_in.sql'))
  await db.exec(
    `INSERT INTO auth.users(id,email) VALUES ('${fresh}','fresh@x.test')`,
  )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

it('defaults new profiles to party SMS off while preserving existing choices', async () => {
  const { rows } = await db.query<{
    user_id: string
    party_sms_enabled: boolean
  }>('SELECT user_id, party_sms_enabled FROM profiles')
  expect(rows.find((row) => row.user_id === fresh)?.party_sms_enabled).toBe(
    false,
  )
  expect(rows.find((row) => row.user_id === optedIn)?.party_sms_enabled).toBe(
    true,
  )
  expect(rows.find((row) => row.user_id === optedOut)?.party_sms_enabled).toBe(
    false,
  )
})
