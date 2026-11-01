// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const users = {
  free: '10000000-0000-0000-0000-0000000000c1',
  lifetime: '10000000-0000-0000-0000-0000000000c2',
  scanner: '10000000-0000-0000-0000-0000000000c3',
  expiredScanner: '10000000-0000-0000-0000-0000000000c4',
  trialLifetime: '10000000-0000-0000-0000-0000000000c5',
}
let db: PGlite

const resolve = async (user: string) =>
  (
    await asUser<{ plan: string; model: string }>(
      db,
      user,
      'SELECT * FROM resolve_ai_scan_model()',
    )
  ).rows[0]

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101060000_published_default_accounts.sql',
    '20261101100000_ai_model_policies.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES
      ${Object.values(users)
        .map((id) => `('${id}','${id}@example.test')`)
        .join(',')};
    INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES
      ('${users.lifetime}','lifetime_premium','active',NULL),
      ('${users.scanner}','ai_scanner_sub','active',now() + interval '10 days'),
      ('${users.scanner}','lifetime_premium','active',NULL),
      ('${users.expiredScanner}','ai_scanner_sub','active',now() - interval '1 day'),
      ('${users.trialLifetime}','lifetime_premium','trialing',now() + interval '3 days')
    ON CONFLICT(user_id,feature_id) DO UPDATE SET status = EXCLUDED.status, valid_until = EXCLUDED.valid_until;
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('AI model policies', () => {
  it('maps each plan to its seeded model', async () => {
    expect(await resolve(users.free)).toEqual({
      plan: 'free',
      model: 'gpt-4o-mini',
    })
    expect(await resolve(users.lifetime)).toEqual({
      plan: 'lifetime',
      model: 'gpt-4o',
    })
    expect(await resolve(users.trialLifetime)).toEqual({
      plan: 'lifetime',
      model: 'gpt-4o',
    })
    expect(await resolve(users.expiredScanner)).toEqual({
      plan: 'free',
      model: 'gpt-4o-mini',
    })
  })

  it('prefers the AI Scanner subscription over Lifetime Premium', async () => {
    await db.exec(
      "UPDATE ai_model_policies SET model = 'gpt-4.1' WHERE plan = 'ai_scanner'",
    )
    expect(await resolve(users.scanner)).toEqual({
      plan: 'ai_scanner',
      model: 'gpt-4.1',
    })
    expect((await resolve(users.lifetime)).model).toBe('gpt-4o')
  })

  it('picks up policy changes without a deploy and falls back to the free model', async () => {
    await db.exec("DELETE FROM ai_model_policies WHERE plan = 'lifetime'")
    expect(await resolve(users.lifetime)).toEqual({
      plan: 'lifetime',
      model: 'gpt-4o-mini',
    })
  })

  it('rejects malformed model names and unknown plans', async () => {
    await expect(
      db.exec(
        "UPDATE ai_model_policies SET model = 'gpt 4o; drop' WHERE plan = 'free'",
      ),
    ).rejects.toThrow()
    await expect(
      db.exec(
        "INSERT INTO ai_model_policies(plan, model) VALUES ('enterprise','gpt-4o')",
      ),
    ).rejects.toThrow()
  })

  it('hides the policy table from clients and requires authentication', async () => {
    // RLS without policies hides rows even if a blanket grant exists.
    const visible = await asUser(
      db,
      users.free,
      'SELECT * FROM ai_model_policies',
    )
    expect(visible.rows).toEqual([])
    await db.exec('SET ROLE anon')
    try {
      await expect(
        db.query('SELECT * FROM resolve_ai_scan_model()'),
      ).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('RESET ROLE')
    }
    const { rows } = await db.query('SELECT * FROM resolve_ai_scan_model()')
    expect(rows).toEqual([])
  })
})
