import { strict as assert } from 'node:assert'
import { performance } from 'node:perf_hooks'
import { createMigratedDb } from '../../src/test/migrated-db'
import {
  pinDigest,
  randomSecret,
  proofDigest,
} from '../../src/features/security/server/crypto'
export async function benchmarkSecurity(users: number, samples: number) {
  const db = await createMigratedDb([
    '20261106000000_privacy_cover.sql',
    '20261106010000_application_pin.sql',
  ])
  try {
    await db.query(
      `INSERT INTO auth.users(id,email) SELECT md5(i::text)::uuid,'security-'||i||'@test.invalid' FROM generate_series(1,$1::int) i`,
      [users],
    )
    const owner = (await db.query<{ id: string }>("SELECT md5('1')::uuid id"))
      .rows[0].id
    const salt = randomSecret(),
      digest = await pinDigest('123456', salt),
      proof = proofDigest(randomSecret())
    await db.query('SELECT security_pin_proof($1,$2)', [owner, proof])
    await db.query('SELECT security_pin_manage($1,$2,$3,$4)', [
      owner,
      proof,
      digest,
      salt,
    ])
    const revision = (
      await db.query<{ revision: string }>(
        'SELECT revision FROM application_pins WHERE user_id=$1',
        [owner],
      )
    ).rows[0].revision
    const timings: number[] = []
    for (let i = 0; i < samples; i++) {
      const before = performance.now()
      const candidate = await pinDigest('123456', salt)
      await db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE authenticated')
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ])
        const visible = await tx.query<{
          user_id: string
          privacy_cover: boolean
        }>('SELECT user_id,privacy_cover FROM profiles')
        assert.deepEqual(
          visible.rows,
          [{ user_id: owner, privacy_cover: true }],
          '10k profile preferences remain owner-scoped',
        )
        await tx.query('UPDATE profiles SET privacy_cover=false')
        await tx.exec('RESET ROLE')
        const verified = await tx.query<{ result: { status: string } }>(
          'SELECT security_pin_check($1,$2,$3) result',
          [owner, candidate, revision],
        )
        assert.equal(verified.rows[0].result.status, 'unlocked')
        await tx.query('SELECT security_pin_proof($1,$2)', [owner, proof])
        await tx.query('SELECT security_pin_manage($1,$2,NULL,NULL)', [
          owner,
          proof,
        ])
        assert.equal(
          (
            await tx.query<{ digest: null }>(
              'SELECT digest FROM application_pins WHERE user_id=$1',
              [owner],
            )
          ).rows[0].digest,
          null,
        )
        await tx.rollback()
      })
      timings.push(performance.now() - before)
    }
    return { timings, users }
  } finally {
    await db.close()
  }
}
