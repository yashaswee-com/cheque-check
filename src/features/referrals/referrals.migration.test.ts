// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb } from '@/test/migrated-db'

const owner = '10000000-0000-4000-8000-000000000001'
const buyer = '10000000-0000-4000-8000-000000000002'
const third = '10000000-0000-4000-8000-000000000003'
let db: PGlite
let serial = 0
const id = () => `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`
type Quote = {
  id: string
  discount: number
  provider_amount: number
  wallet_amount: number
  reward: number
  status: string
}
beforeAll(async () => {
  db = await createMigratedDb(['20261104020000_referrals_and_wallet.sql'])
  await db.exec(
    `REVOKE ALL ON referral_codes,referrals,referral_wallets,payment_checkouts,referral_wallet_ledger FROM authenticated`,
  )
}, 60000)
beforeEach(async () => {
  await db.exec(`TRUNCATE referral_wallet_ledger,payment_checkouts,referral_wallets,referrals,referral_codes,transactions,user_entitlements,user_quotas,profiles,auth.users CASCADE;
    INSERT INTO auth.users(id,email) VALUES('${owner}','owner@x.test'),('${buyer}','buyer@x.test'),('${third}','third@x.test');
    INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES('${owner}','lifetime_premium','active',NULL)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=NULL;
    INSERT INTO transactions(user_id,product_id,amount,currency,status,type,feature_id,razorpay_order_id,razorpay_payment_id)
      VALUES('${owner}','lifetime_premium',30000,'INR','captured','lifetime','lifetime_premium','legacy','legacy_payment');
    INSERT INTO referral_codes(user_id,code) VALUES('${owner}','ABCDEF123456');`)
})
afterAll(async () => {
  await db?.close()
})
async function apply(user = buyer, code = 'ABCDEF123456') {
  return asUser(db, user, `SELECT apply_referral_code('${code}')`)
}
async function prepare(
  product = 'lifetime_premium',
  user = buyer,
  checkout = id(),
) {
  return (
    await db.query<Quote>('SELECT * FROM prepare_payment_checkout($1,$2,$3)', [
      checkout,
      user,
      product,
    ])
  ).rows[0]
}
async function capture(q: Quote, user = buyer, product = 'lifetime_premium') {
  const order = 'order_' + q.id
  await db.query('SELECT record_checkout_order($1,$2)', [q.id, order])
  return db.query('SELECT fulfill_payment_order($1,$2,$3,$4,$5,$6)', [
    order,
    'pay_' + q.id,
    user,
    product,
    q.provider_amount,
    'INR',
  ])
}
async function wallet(user = owner) {
  return (
    await db.query<{ balance: number; reserved: number }>(
      'SELECT balance::int,reserved::int FROM referral_wallets WHERE user_id=$1',
      [user],
    )
  ).rows[0]
}
async function sub(user = owner) {
  await db.exec(`INSERT INTO user_entitlements(user_id,feature_id,status,valid_until)
    VALUES('${user}','ai_scanner_sub','active',now()+interval '30 days')
    ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=EXCLUDED.valid_until`)
}
describe('referral checkout and wallet lifecycle on full schema', () => {
  it('makes repeated attribution idempotent but refuses switching and cycles', async () => {
    await apply()
    await apply()
    await db.exec(`INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES('${third}','lifetime_premium','active',NULL)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=NULL;
      INSERT INTO transactions(user_id,product_id,amount,currency,status,type,feature_id,razorpay_order_id,razorpay_payment_id)
        VALUES('${third}','lifetime_premium',30000,'INR','captured','lifetime','lifetime_premium','third','third-payment');
      INSERT INTO referral_codes VALUES('${third}','111111111111')`)
    await expect(apply(buyer, '111111111111')).rejects.toThrow(
      /cannot be changed/,
    )
    await db.exec(
      `DELETE FROM referrals;INSERT INTO referrals VALUES('${owner}','${buyer}',now())`,
    )
    await expect(apply()).rejects.toThrow(/cycles/)
  })
  it('refuses duplicate provider creation and persists release for expired same-ID quote', async () => {
    await sub()
    await db.exec(
      `INSERT INTO referral_wallets VALUES('${owner}','INR',1000,0)`,
    )
    const q = await prepare('ai_scan_250', owner)
    await expect(prepare('ai_scan_250', owner, q.id)).rejects.toThrow(
      /in progress/,
    )
    await db.query(
      "UPDATE payment_checkouts SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [q.id],
    )
    expect(await prepare('ai_scan_250', owner, q.id)).toMatchObject({
      status: 'expired',
    })
    expect(await wallet()).toEqual({ balance: 1000, reserved: 0 })
  })
  it('rejects a second payment identity and NULL amount for a locked order', async () => {
    const q = await prepare()
    await capture(q)
    await expect(
      db.query(
        "SELECT fulfill_payment_order($1,'different',$2,'lifetime_premium',30000,'INR')",
        ['order_' + q.id, buyer],
      ),
    ).rejects.toThrow(/Late or invalid/)
    await expect(
      db.query(
        "SELECT fulfill_payment_order($1,$2,$3,'lifetime_premium',NULL,'INR')",
        ['order_' + q.id, 'pay_' + q.id, buyer],
      ),
    ).rejects.toThrow(/locked quote/)
  })
  it('full refund of an old subscription does not cancel a later paid renewal', async () => {
    const old = await prepare('ai_scanner_30d', buyer)
    await capture(old, buyer, 'ai_scanner_30d')
    await db.exec(
      `UPDATE user_entitlements SET valid_until=now()-interval '1 day' WHERE user_id='${buyer}' AND feature_id='ai_scanner_sub'`,
    )
    const newer = await prepare('ai_scanner_30d', buyer)
    await capture(newer, buyer, 'ai_scanner_30d')
    await db.query("SELECT refund_payment_checkout($1,5000,'INR')", [
      'pay_' + old.id,
    ])
    expect(
      (
        await db.query<{ status: string }>(
          `SELECT status FROM user_entitlements WHERE user_id='${buyer}' AND feature_id='ai_scanner_sub'`,
        )
      ).rows[0].status,
    ).toBe('active')
  })
  it('returns at most fifty ledger entries in numeric ID order', async () => {
    await db.exec(`INSERT INTO payment_checkouts(id,user_id,product_id,product_snapshot,base_amount,discount,wallet_amount,provider_amount,currency,status)
      SELECT md5(i::text)::uuid,'${owner}','ai_scan_250','{}',5000,0,0,5000,'INR','paid' FROM generate_series(1,110) i;
      INSERT INTO referral_wallet_ledger(user_id,currency,checkout_id,kind,amount)
      SELECT '${owner}','INR',md5(i::text)::uuid,'reward',1 FROM generate_series(1,110) i`)
    const result = await asUser<{
      referral_summary: { entries: { id: string }[] }
    }>(db, owner, 'SELECT referral_summary()')
    const entries = result.rows[0].referral_summary.entries
    expect(entries).toHaveLength(50)
    const ids = entries.map((e) => Number(e.id))
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  })
  it('rejects deactivated and anonymous callers', async () => {
    await db.exec(
      `UPDATE profiles SET deleted_at=now() WHERE user_id='${buyer}'`,
    )
    await expect(apply()).rejects.toThrow(/Authentication/)
    await expect(
      asUser(db, buyer, 'SELECT referral_summary()'),
    ).rejects.toThrow(/Authentication/)
    await expect(db.query('SELECT referral_summary()')).rejects.toThrow(
      /Authentication/,
    )
  })
  it('discounts exactly 20% and rewards exactly once only after capture', async () => {
    await apply()
    const q = await prepare()
    expect(q).toMatchObject({
      discount: 6000,
      provider_amount: 24000,
      reward: 6000,
      wallet_amount: 0,
    })
    expect(await wallet()).toBeUndefined()
    await capture(q)
    await capture(q)
    expect(await wallet()).toEqual({ balance: 6000, reserved: 0 })
    expect(
      (await db.query('SELECT id FROM referral_wallet_ledger')).rows,
    ).toHaveLength(1)
  })
  it('prevents self-referral, invalid codes, switching referrers and late attribution', async () => {
    await expect(apply(owner)).rejects.toThrow(/not eligible/)
    await expect(apply(buyer, '000000000000')).rejects.toThrow(/not eligible/)
    await prepare()
    await expect(apply()).rejects.toThrow(/before your first/)
  })
  it('requires paid Lifetime rather than a trial or administrator entitlement alone', async () => {
    await db.exec("UPDATE transactions SET status='refunded'")
    await expect(apply()).rejects.toThrow(/not eligible/)
    const result = await asUser<{ referral_summary: { eligible: boolean } }>(
      db,
      owner,
      'SELECT referral_summary()',
    )
    expect(result.rows[0].referral_summary.eligible).toBe(false)
  })
  it('allows only one active checkout and rejects conflicting idempotency ownership', async () => {
    const q = await prepare()
    await expect(prepare()).rejects.toThrow(/active checkout/)
    await expect(prepare('lifetime_premium', third, q.id)).rejects.toThrow(
      /ownership/,
    )
  })
  it('rejects mismatched payment amounts atomically without rewarding', async () => {
    await apply()
    const q = await prepare()
    await db.query('SELECT record_checkout_order($1,$2)', [q.id, 'bad'])
    await expect(
      db.query(
        "SELECT fulfill_payment_order('bad','pay',$1,'lifetime_premium',1,'INR')",
        [buyer],
      ),
    ).rejects.toThrow(/locked quote/)
    expect(await wallet()).toBeUndefined()
  })
  it('fully funds an eligible top-up without a zero-value provider order', async () => {
    await apply()
    const q = await prepare()
    await capture(q)
    await sub()
    const top = await prepare('ai_scan_250', owner)
    expect(top).toMatchObject({ wallet_amount: 5000, provider_amount: 0 })
    expect(await wallet()).toEqual({ balance: 6000, reserved: 5000 })
    await db.query('SELECT fulfill_wallet_checkout($1)', [top.id])
    await db.query('SELECT fulfill_wallet_checkout($1)', [top.id])
    expect(await wallet()).toEqual({ balance: 1000, reserved: 0 })
    expect(
      (
        await db.query<{ limit: number }>(
          `SELECT "limit" FROM user_quotas WHERE user_id='${owner}' AND feature_id='ai_scan'`,
        )
      ).rows[0].limit,
    ).toBe(260)
  })
  it('supports partial wallet funding and prevents concurrent double-spending', async () => {
    await sub()
    await db.exec(
      `INSERT INTO referral_wallets VALUES('${owner}','INR',1000,0)`,
    )
    const q = await prepare('ai_scan_250', owner)
    expect(q).toMatchObject({ wallet_amount: 1000, provider_amount: 4000 })
    await expect(prepare('ai_scan_250', owner)).rejects.toThrow(
      /active checkout/,
    )
    await capture(q, owner, 'ai_scan_250')
    expect(await wallet()).toEqual({ balance: 0, reserved: 0 })
  })
  it('wallet credit cannot bypass required subscription', async () => {
    await db.exec(
      `INSERT INTO referral_wallets VALUES('${owner}','INR',50000,0)`,
    )
    await expect(prepare('ai_scan_250', owner)).rejects.toThrow(
      /Required subscription/,
    )
  })
  it('releases failed/expired reservations once and rejects late capture', async () => {
    await sub()
    await db.exec(
      `INSERT INTO referral_wallets VALUES('${owner}','INR',1000,0)`,
    )
    const q = await prepare('ai_scan_250', owner)
    await db.query('SELECT record_checkout_order($1,$2)', [q.id, 'expired'])
    await db.query(
      "UPDATE payment_checkouts SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [q.id],
    )
    await db.query('SELECT expire_payment_checkouts()')
    await db.query('SELECT expire_payment_checkouts()')
    expect(await wallet()).toEqual({ balance: 1000, reserved: 0 })
    await expect(
      db.query(
        "SELECT fulfill_payment_order('expired','p',$1,'ai_scan_250',4000,'INR')",
        [owner],
      ),
    ).rejects.toThrow(/Late or invalid/)
  })
  it('full refunds reverse spent rewards into debt and return top-up wallet portion exactly once', async () => {
    await apply()
    const q = await prepare()
    await capture(q)
    await sub()
    const top = await prepare('ai_scan_250', owner)
    await db.query('SELECT fulfill_wallet_checkout($1)', [top.id])
    await db.query("SELECT refund_payment_checkout($1,24000,'INR')", [
      'pay_' + q.id,
    ])
    await db.query("SELECT refund_payment_checkout($1,24000,'INR')", [
      'pay_' + q.id,
    ])
    expect(await wallet()).toEqual({ balance: -5000, reserved: 0 })
    const next = await prepare('ai_scan_250', owner)
    expect(next.wallet_amount).toBe(0)
    await db.query("SELECT release_payment_checkout($1,'failed')", [next.id])
    await db.query("SELECT refund_payment_checkout($1,0,'INR')", [
      'wallet_payment_' + top.id,
    ])
    expect(await wallet()).toEqual({ balance: 0, reserved: 0 })
  })
  it('rejects partial refunds without changing credits', async () => {
    await apply()
    const q = await prepare()
    await capture(q)
    await expect(
      db.query("SELECT refund_payment_checkout($1,1000,'INR')", [
        'pay_' + q.id,
      ]),
    ).rejects.toThrow(/Partial refund/)
    expect(await wallet()).toEqual({ balance: 6000, reserved: 0 })
  })
  it('keeps quotes immutable when catalog price changes after order creation', async () => {
    const q = await prepare()
    await db.query('SELECT record_checkout_order($1,$2)', [q.id, 'frozen'])
    await db.exec(
      "UPDATE payment_products SET amount=40000 WHERE id='lifetime_premium'",
    )
    await db.query(
      "SELECT fulfill_payment_order('frozen','frozen_pay',$1,'lifetime_premium',30000,'INR')",
      [buyer],
    )
    await db.exec(
      "UPDATE payment_products SET amount=30000 WHERE id='lifetime_premium'",
    )
  })
  it('restricts clients to owned summary and apply RPCs, never ledger writes or checkout service RPCs', async () => {
    await expect(
      asUser(db, buyer, 'SELECT * FROM referral_wallet_ledger'),
    ).rejects.toThrow(/permission/)
    await expect(
      asUser(
        db,
        buyer,
        `SELECT prepare_payment_checkout('${id()}','${buyer}','lifetime_premium')`,
      ),
    ).rejects.toThrow(/permission/)
    const result = await asUser<{ referral_summary: { entries: unknown[] } }>(
      db,
      buyer,
      'SELECT referral_summary()',
    )
    expect(result.rows[0].referral_summary.entries).toEqual([])
  })
})
