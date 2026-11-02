// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

let db: PGlite
const users = {
  free: '10000000-0000-4000-8000-000000000001',
  lifetime: '10000000-0000-4000-8000-000000000002',
  scanner: '10000000-0000-4000-8000-000000000003',
  trial: '10000000-0000-4000-8000-000000000004',
  custom: '10000000-0000-4000-8000-000000000005',
}
const resolve = async (user: string) =>
  (
    await asUser<{ product_id: string; model: string }>(
      db,
      user,
      'SELECT * FROM resolve_ai_scan_model()',
    )
  ).rows[0]
beforeAll(async () => {
  db = await createMigratedDb([
    '20261101100000_ai_model_policies.sql',
    '20261104020000_referrals_and_wallet.sql',
  ])
  await db.exec(`INSERT INTO auth.users(id,email) VALUES ${Object.values(users)
    .map((id) => `('${id}','${id}@test.invalid')`)
    .join(',')};
    INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES
      ('${users.lifetime}','lifetime_premium','active',NULL),
      ('${users.scanner}','lifetime_premium','active',NULL),
      ('${users.scanner}','ai_scanner_sub','active',now()+interval '10 days'),
      ('${users.trial}','ai_scanner_sub','trialing',now()+interval '3 days');
    INSERT INTO payment_products(id,name,transaction_type,feature_id,amount,entitlement_days,quota_feature_id,quota_increment)
      VALUES ('ai_scanner_pro','AI Pro','subscription','ai_scanner_sub',9000,30,'ai_scan',500);
    SELECT record_payment_order('${users.custom}','ai_scanner_pro','historical-order');
    SELECT fulfill_payment_order('historical-order','historical-pay','${users.custom}','ai_scanner_pro',9000,'INR');
    UPDATE ai_model_policies SET model='gpt-4.1' WHERE plan='ai_scanner'`)
  await db.exec(migration('20261107010000_product_ai_model_policies.sql'))
}, 60000)
afterAll(async () => {
  await db?.close()
})

describe('product-linked AI policies', () => {
  it('preserves configured models and backfills product references for legacy and trial grants', async () => {
    expect(await resolve(users.free)).toEqual({
      product_id: 'free',
      model: 'gpt-4o-mini',
    })
    expect(await resolve(users.lifetime)).toEqual({
      product_id: 'lifetime_premium',
      model: 'gpt-4o',
    })
    expect(await resolve(users.scanner)).toEqual({
      product_id: 'ai_scanner_30d',
      model: 'gpt-4.1',
    })
    expect(await resolve(users.trial)).toEqual({
      product_id: 'ai_scanner_30d',
      model: 'gpt-4.1',
    })
    expect(
      (
        await db.query(
          'SELECT product_id FROM user_entitlements WHERE user_id=$1',
          [users.custom],
        )
      ).rows,
    ).toEqual([{ product_id: 'ai_scanner_pro' }])
    expect((await resolve(users.custom)).product_id).toBe('free')
  })
  it('uses configured priorities and deterministic product IDs for ties', async () => {
    await db.exec(
      "UPDATE ai_model_policies SET priority=30 WHERE product_id='lifetime_premium'",
    )
    expect((await resolve(users.scanner)).product_id).toBe('lifetime_premium')
    await db.exec(
      "UPDATE ai_model_policies SET priority=20 WHERE product_id='lifetime_premium'",
    )
    expect((await resolve(users.scanner)).product_id).toBe('ai_scanner_30d')
    await db.exec(
      "UPDATE ai_model_policies SET priority=10 WHERE product_id='lifetime_premium'",
    )
  })
  it.each(["'expired'", "'canceled'", "'paused'"])(
    'ignores a %s scanner entitlement',
    async (status) => {
      await db.exec(
        `UPDATE user_entitlements SET status=${status} WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub'`,
      )
      expect((await resolve(users.scanner)).product_id).toBe('lifetime_premium')
      await db.exec(
        `UPDATE user_entitlements SET status='active' WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub'`,
      )
    },
  )
  it('rejects expired, unbounded and infinite subscription/trial expiry', async () => {
    for (const validUntil of [
      "now()-interval '1 second'",
      'NULL',
      "'infinity'::timestamptz",
    ]) {
      await db.exec(
        `UPDATE user_entitlements SET valid_until=${validUntil} WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub'`,
      )
      expect((await resolve(users.scanner)).product_id).toBe('lifetime_premium')
    }
    await db.exec(
      `UPDATE user_entitlements SET valid_until=now()+interval '10 days' WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub'`,
    )
  })
  it('tracks the actual captured subscription product, not any other product with the same feature', async () => {
    await db.exec(`INSERT INTO ai_model_policies(product_id,model,priority) VALUES ('ai_scanner_pro','gpt-4.1-mini',50);
      UPDATE user_entitlements SET status='expired' WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub';
      SELECT prepare_payment_checkout('90000000-0000-4000-8000-000000000001','${users.scanner}','ai_scanner_pro');
      SELECT record_checkout_order('90000000-0000-4000-8000-000000000001','custom-order');
      `)
    expect((await resolve(users.scanner)).product_id).toBe('lifetime_premium')
    await db.exec(`
      SELECT fulfill_payment_order('custom-order','custom-pay','${users.scanner}','ai_scanner_pro',9000,'INR')`)
    expect(await resolve(users.scanner)).toEqual({
      product_id: 'ai_scanner_pro',
      model: 'gpt-4.1-mini',
    })
    expect((await resolve(users.trial)).product_id).toBe('ai_scanner_30d')
    await db.exec(
      "UPDATE payment_products SET active=false WHERE id='ai_scanner_pro'",
    )
    expect((await resolve(users.scanner)).product_id).toBe('ai_scanner_pro')
    await db.exec(
      `SELECT admin_refund_transaction(id,'test-operator','Test refund') FROM transactions WHERE razorpay_order_id='custom-order'`,
    )
    expect((await resolve(users.scanner)).product_id).toBe('lifetime_premium')
  })
  it('grants only quota when capturing a top-up against a current subscription', async () => {
    const before = (
      await db.query<{ limit: number }>(
        `SELECT "limit" FROM user_quotas WHERE user_id=$1 AND feature_id='ai_scan'`,
        [users.custom],
      )
    ).rows[0].limit
    await db.exec(`SELECT record_payment_order('${users.custom}','ai_scan_250','topup-order');
      SELECT fulfill_payment_order('topup-order','topup-pay','${users.custom}','ai_scan_250',5000,'INR')`)
    expect(
      (
        await db.query<{ limit: number }>(
          `SELECT "limit" FROM user_quotas WHERE user_id=$1 AND feature_id='ai_scan'`,
          [users.custom],
        )
      ).rows[0].limit,
    ).toBe(before + 250)
    expect((await resolve(users.custom)).product_id).toBe('ai_scanner_pro')
  })
  it('keeps top-ups quota-only and free non-purchasable at every payment entry', async () => {
    await expect(
      db.exec(
        "INSERT INTO ai_model_policies(product_id,model,priority) VALUES ('ai_scan_250','gpt-4o',100)",
      ),
    ).rejects.toThrow(/entitlement product/)
    await expect(
      db.exec(
        `SELECT record_payment_order('${users.free}','free','free-order')`,
      ),
    ).rejects.toThrow()
    await expect(
      db.exec(
        `SELECT prepare_payment_checkout('90000000-0000-4000-8000-000000000002','${users.free}','free')`,
      ),
    ).rejects.toThrow()
    await expect(
      db.exec(`INSERT INTO payment_checkouts(id,user_id,product_id,product_snapshot,base_amount,discount,wallet_amount,provider_amount,currency)
      VALUES (gen_random_uuid(),'${users.free}','free','{}',1,0,0,1,'INR')`),
    ).rejects.toThrow(/not purchasable/)
    await expect(
      db.exec(`SELECT admin_record_grant_transaction('${users.free}','free')`),
    ).rejects.toThrow(/not purchasable/)
    await expect(
      db.exec(`INSERT INTO transactions(user_id,product_id,feature_id,status,type,amount)
      VALUES ('${users.free}','free','ai_scan','captured','lifetime',0)`),
    ).rejects.toThrow(/not purchasable/)
    await expect(
      db.exec("UPDATE payment_products SET active=true WHERE id='free'"),
    ).rejects.toThrow()
    await expect(
      db.exec(
        `UPDATE user_entitlements SET product_id='free' WHERE user_id='${users.scanner}' AND feature_id='ai_scanner_sub'`,
      ),
    ).rejects.toThrow(/does not match/)
  })
  it('falls back to the product-linked free policy if a paid policy is removed', async () => {
    await db.exec(
      "DELETE FROM ai_model_policies WHERE product_id='lifetime_premium'",
    )
    expect((await resolve(users.lifetime)).product_id).toBe('free')
    await db.exec(
      "INSERT INTO ai_model_policies(product_id,model,priority) VALUES ('lifetime_premium','gpt-4o',10)",
    )
  })
  it('resolves owner-scoped policies within the local 1000ms budget with 10000 other users', async () => {
    await db.exec(`INSERT INTO auth.users(id,email)
      SELECT md5(i::text)::uuid,'ai-policy-'||i||'@test.invalid' FROM generate_series(1,10000) i;
      INSERT INTO user_entitlements(user_id,feature_id,status,valid_until,product_id)
      SELECT md5(i::text)::uuid,'ai_scanner_sub','active',now()+interval '30 days','ai_scanner_pro' FROM generate_series(1,10000) i;
      ANALYZE user_entitlements`)
    const timings: number[] = []
    for (let i = 0; i < 30; i++) {
      const start = performance.now()
      expect((await resolve(users.free)).product_id).toBe('free')
      timings.push(performance.now() - start)
    }
    expect(
      timings.sort((a, b) => a - b)[Math.ceil(timings.length * 0.95) - 1],
    ).toBeLessThan(1000)
    const { rows } = await db.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT 1 FROM user_entitlements WHERE user_id=$1 AND product_id='ai_scanner_pro'`,
      [users.custom],
    )
    expect(rows.map((row) => row['QUERY PLAN']).join(' ')).toMatch(
      /Index.*user_entitlements/,
    )
  }, 60000)
  it('raises an explicit configuration error if no eligible policy exists', async () => {
    await db.exec("DELETE FROM ai_model_policies WHERE product_id='free'")
    await expect(resolve(users.free)).rejects.toThrow(
      'No eligible AI model policy configured',
    )
    await db.exec(
      "INSERT INTO ai_model_policies(product_id,model,priority) VALUES ('free','gpt-4o-mini',0)",
    )
  })
  it('enforces model/priority/FK validation, hides policy writes and returns nothing for anonymous or inactive accounts', async () => {
    for (const sql of [
      "UPDATE ai_model_policies SET model='bad model' WHERE product_id='free'",
      "UPDATE ai_model_policies SET priority=1 WHERE product_id='free'",
      "UPDATE ai_model_policies SET priority=0 WHERE product_id='lifetime_premium'",
      "INSERT INTO ai_model_policies(product_id,model,priority) VALUES ('missing','gpt-4o',10)",
    ])
      await expect(db.exec(sql)).rejects.toThrow()
    expect(
      (await asUser(db, users.free, 'SELECT * FROM ai_model_policies')).rows,
    ).toEqual([])
    await db.exec('REVOKE ALL ON ai_model_policies FROM authenticated')
    await expect(
      asUser(
        db,
        users.free,
        "UPDATE ai_model_policies SET model='gpt-4.1' WHERE product_id='free'",
      ),
    ).rejects.toThrow(/permission denied/)
    expect(
      (await db.query('SELECT * FROM resolve_ai_scan_model()')).rows,
    ).toEqual([])
    await db.exec(
      `UPDATE profiles SET deleted_at=now(),deletion_batch_id=gen_random_uuid() WHERE user_id='${users.free}'`,
    )
    expect(await resolve(users.free)).toBeUndefined()
  })
})
