// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMigratedDb, asUser } from '@/test/migrated-db'
import { proofDigest } from './server/crypto'
describe('service-only durable PIN and attempt limits', () => {
  it('protects secrets, rejects reused/expired/cross-user proof, and serializes attempt lockout', async () => {
    const db = await createMigratedDb(['20261106010000_application_pin.sql'])
    const a = '10000000-0000-4000-8000-000000000001',
      b = '10000000-0000-4000-8000-000000000002'
    const digest = 'a'.repeat(64),
      salt = 'b'.repeat(64),
      proof = proofDigest('c'.repeat(64))
    try {
      await db.exec(`INSERT INTO auth.users(id,email) VALUES('${a}','a@test.invalid'),('${b}','b@test.invalid');
        REVOKE ALL ON application_pins FROM authenticated`)
      await expect(
        asUser(db, a, 'SELECT * FROM application_pins'),
      ).rejects.toThrow(/permission denied/)
      await expect(
        asUser(db, a, `SELECT security_pin_proof('${a}','${proof}')`),
      ).rejects.toThrow(/permission denied/)
      await db.exec(
        `SELECT security_pin_proof('${a}','${proof}');SELECT security_pin_manage('${a}','${proof}','${digest}','${salt}')`,
      )
      await expect(
        db.query(`SELECT security_pin_manage('${a}','${proof}',NULL,NULL)`),
      ).rejects.toThrow(/Fresh authentication/)
      await db.exec(`SELECT security_pin_proof('${a}','${proof}')`)
      await expect(
        db.query(`SELECT security_pin_manage('${b}','${proof}',NULL,NULL)`),
      ).rejects.toThrow(/Fresh authentication/)
      await db.exec(
        "UPDATE application_pins SET proof_expires_at=now()-interval '1 second'",
      )
      await expect(
        db.query(`SELECT security_pin_manage('${a}','${proof}',NULL,NULL)`),
      ).rejects.toThrow(/Fresh authentication/)
      const revision = (
        await db.query<{ revision: string }>(
          `SELECT revision FROM application_pins WHERE user_id='${a}'`,
        )
      ).rows[0].revision
      const check = async (candidate: string, rev = revision) =>
        (
          await db.query<{ result: { status: string; remaining?: number } }>(
            `SELECT security_pin_check($1,$2,$3) result`,
            [a, candidate, rev],
          )
        ).rows[0].result
      expect(
        await check('d'.repeat(64), '20000000-0000-4000-8000-000000000001'),
      ).toEqual({ status: 'changed' })
      expect(await check('d'.repeat(64))).toEqual({
        status: 'incorrect',
        remaining: 4,
      })
      expect(await check(digest)).toMatchObject({ status: 'unlocked' })
      const failures = await Promise.all(
        Array.from({ length: 5 }, () => check('d'.repeat(64))),
      )
      expect(failures.map((result) => result.status)).toEqual([
        'incorrect',
        'incorrect',
        'incorrect',
        'incorrect',
        'blocked',
      ])
      expect(await check(digest)).toEqual({ status: 'blocked', remaining: 0 })
      await db.exec(
        `SELECT security_pin_proof('${a}','${proof}');SELECT security_pin_manage('${a}','${proof}','${digest}','${salt}')`,
      )
      expect(
        (
          await db.query<{ failures: number }>(
            `SELECT failures FROM application_pins WHERE user_id='${a}'`,
          )
        ).rows[0].failures,
      ).toBe(0)
      expect(await check(digest)).toEqual({ status: 'changed' })
      await db.exec(
        `SELECT security_pin_proof('${a}','${proof}');SELECT security_pin_manage('${a}','${proof}',NULL,NULL)`,
      )
      expect(
        (
          await db.query<{ digest: null; salt: null }>(
            `SELECT digest,salt FROM application_pins WHERE user_id='${a}'`,
          )
        ).rows[0],
      ).toEqual({ digest: null, salt: null })
      await db.exec(`UPDATE profiles SET deleted_at=now() WHERE user_id='${a}'`)
      await expect(
        db.query(`SELECT security_pin_proof('${a}','${proof}')`),
      ).rejects.toThrow(/Invalid proof owner/)
    } finally {
      await db.close()
    }
  }, 60000)
})
