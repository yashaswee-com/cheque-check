// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMigratedDb, asUser } from '@/test/migrated-db'
describe('appearance profile persistence', () => {
  it('defaults to System, accepts closed choices, and isolates users', async () => {
    const db = await createMigratedDb(['20261105010000_profile_appearance.sql'])
    const a = '10000000-0000-4000-8000-000000000001',
      b = '10000000-0000-4000-8000-000000000002'
    try {
      await db.exec(
        `INSERT INTO auth.users(id,email) VALUES('${a}','a@test.invalid'),('${b}','b@test.invalid')`,
      )
      expect(
        (
          await asUser<{ appearance: string }>(
            db,
            a,
            'SELECT appearance FROM profiles',
          )
        ).rows[0].appearance,
      ).toBe('system')
      await asUser(db, a, "UPDATE profiles SET appearance='dark'")
      expect(
        (
          await asUser<{ appearance: string }>(
            db,
            b,
            'SELECT appearance FROM profiles',
          )
        ).rows[0].appearance,
      ).toBe('system')
      await expect(
        asUser(db, a, "UPDATE profiles SET appearance='invalid'"),
      ).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 60000)
})
