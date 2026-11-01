// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const free = '10000000-0000-0000-0000-0000000000d1'
const premium = '10000000-0000-0000-0000-0000000000d2'
const trial = '10000000-0000-0000-0000-0000000000d3'
const newcomer = '10000000-0000-0000-0000-0000000000d4'
const id = (prefix: string, user: string, n: number) =>
  `${prefix}${n}${user.slice(2)}`
const biz = (user: string, n: number) => id('2', user, n)
const partyOf = (user: string, n: number) => id('3', user, n)
const accountOf = (user: string, n: number) => id('4', user, n)
let db: PGlite
let serial = 100000

async function seed(user: string) {
  for (const n of [1, 2]) {
    await db.exec(`
      INSERT INTO businesses(id,user_id,name) VALUES('${biz(user, n)}','${user}','B${n}');
      INSERT INTO parties(id,business_id,name,contact) VALUES('${partyOf(user, n)}','${biz(user, n)}','P','+919876543210');
      INSERT INTO accounts(id,business_id,account_name,account_number) VALUES('${accountOf(user, n)}','${biz(user, n)}','A','1');
    `)
  }
}

function insertCheque(user: string, n = 1, draft = false) {
  const number = String(++serial)
  return asUser<{ id: string }>(
    db,
    user,
    `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date,is_draft)
     VALUES('${biz(user, n)}','${partyOf(user, n)}','${accountOf(user, n)}','${number}',1,'Outward',
       ${draft ? 'NULL' : "'Issued'"},'2026-11-01',${draft})
     RETURNING id`,
  )
}

const usage = async (user: string) =>
  (
    await asUser<Record<string, unknown>>(
      db,
      user,
      'SELECT * FROM free_plan_usage()',
    )
  ).rows[0]

beforeAll(async () => {
  db = await createMigratedDb([
    '20261101060000_published_default_accounts.sql',
    '20261101080000_six_digit_cheque_numbers.sql',
    '20261101110000_free_plan_limits.sql',
  ])
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES('${free}','f@x.test'),('${premium}','p@x.test'),('${trial}','t@x.test');
    INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES
      ('${premium}','lifetime_premium','active',NULL),
      ('${trial}','lifetime_premium','trialing',now() + interval '2 days')
    ON CONFLICT(user_id,feature_id) DO UPDATE SET status = EXCLUDED.status, valid_until = EXCLUDED.valid_until;
  `)
  for (const user of [free, premium, trial]) await seed(user)
  // 49 active cheques split across two businesses, plus noise that must not count.
  for (let i = 0; i < 49; i++) await insertCheque(free, (i % 2) + 1)
  await insertCheque(free, 1, true)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('free plan cheque cap', () => {
  it('counts active published cheques across all businesses, ignoring drafts', async () => {
    expect(await usage(free)).toMatchObject({
      unlimited: false,
      cheques_used: 49,
      cheques_limit: 50,
    })
  })

  it('allows the 50th cheque and rejects the 51st with SQLSTATE 53400', async () => {
    await insertCheque(free, 2)
    const error = await insertCheque(free, 1).catch((e) => e)
    expect(error).toMatchObject({ code: '53400' })
    expect(String(error.message)).toMatch(/Free plan limit of 50/)
    expect((await usage(free)).cheques_used).toBe(50)
  })

  it('still lets free users save drafts and edit active cheques at the cap', async () => {
    const draft = await insertCheque(free, 1, true)
    expect(draft.rows).toHaveLength(1)
    await asUser(
      db,
      free,
      `UPDATE cheques SET notes = 'edited' WHERE business_id = '${biz(free, 1)}' AND NOT is_draft`,
    )
  })

  it('blocks publishing a draft at the cap', async () => {
    await expect(
      asUser(
        db,
        free,
        `UPDATE cheques SET is_draft = false, status = 'Issued'
         WHERE id = (SELECT id FROM cheques WHERE is_draft AND business_id = '${biz(free, 1)}' LIMIT 1)`,
      ),
    ).rejects.toMatchObject({ code: '53400' })
  })

  it('frees a slot when a cheque is deleted', async () => {
    await asUser(
      db,
      free,
      `SELECT lifecycle_delete('cheques', id) FROM cheques
       WHERE business_id = '${biz(free, 2)}' AND NOT is_draft AND deleted_at IS NULL LIMIT 1`,
    )
    expect((await usage(free)).cheques_used).toBe(49)
    await insertCheque(free, 2)
    await expect(insertCheque(free, 2)).rejects.toMatchObject({
      code: '53400',
    })
  })

  it('exempts Lifetime Premium, including an active trial', async () => {
    for (const user of [premium, trial]) {
      for (let i = 0; i < 51; i++) await insertCheque(user, 1)
      expect(await usage(user)).toMatchObject({
        unlimited: true,
        cheques_used: 50,
      })
    }
  }, 60_000)

  it('does not apply the cap to service-role operations', async () => {
    await db.exec(`
      INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,type,status,cheque_date)
      VALUES('${biz(free, 1)}','${partyOf(free, 1)}','${accountOf(free, 1)}','999998',1,'Outward','Issued','2026-11-01')`)
  })
})

describe('free plan quotas', () => {
  it('grants new users 10 AI scans and 10 voice reminders', async () => {
    await db.exec(
      `INSERT INTO auth.users(id,email) VALUES('${newcomer}','n@x.test')`,
    )
    const { rows } = await db.query<{ feature_id: string; limit: number }>(
      `SELECT feature_id, "limit" FROM user_quotas WHERE user_id = '${newcomer}' ORDER BY feature_id`,
    )
    expect(rows).toEqual([
      { feature_id: 'ai_scan', limit: 10 },
      { feature_id: 'voice_reminder', limit: 10 },
    ])
    expect(await usage(newcomer)).toEqual({
      unlimited: false,
      cheques_used: 0,
      cheques_limit: 50,
      ai_scans_used: 0,
      ai_scans_limit: 10,
      voice_used: 0,
      voice_limit: 10,
    })
  })

  it('returns no usage row without an authenticated caller', async () => {
    const { rows } = await db.query('SELECT * FROM free_plan_usage()')
    expect(rows).toEqual([])
  })
})
