// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMigratedDb, asUser } from '@/test/migrated-db'
import { toProfileUpdate } from '@/features/profile/repositories/profile.repository'
describe('privacy preference ownership', () => {
  it('defaults on and updates only the current owner', async () => {
    const db = await createMigratedDb(['20261106000000_privacy_cover.sql'])
    const a = '10000000-0000-4000-8000-000000000001',
      b = '10000000-0000-4000-8000-000000000002'
    try {
      await db.exec(
        `INSERT INTO auth.users(id,email) VALUES('${a}','a@test.invalid'),('${b}','b@test.invalid')`,
      )
      await asUser(db, a, 'UPDATE profiles SET privacy_cover=false')
      expect(
        (
          await asUser<{ privacy_cover: boolean }>(
            db,
            b,
            'SELECT privacy_cover FROM profiles',
          )
        ).rows,
      ).toEqual([{ privacy_cover: true }])
      expect(toProfileUpdate({ privacy_cover: false })).toMatchObject({
        privacy_cover: false,
      })
      expect(() =>
        toProfileUpdate(JSON.parse('{"privacy_cover":"false"}')),
      ).toThrow()
    } finally {
      await db.close()
    }
  }, 60000)
})
