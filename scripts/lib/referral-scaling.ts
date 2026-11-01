import { strict as assert } from 'node:assert'
import { performance } from 'node:perf_hooks'
import { randomUUID, createHash } from 'node:crypto'
import { createMigratedDb } from '../../src/test/migrated-db'

const uuid = (n: number) => {
  const h = createHash('md5').update(String(n)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export async function benchmarkReferrals(users: number, samples: number) {
  const db = await createMigratedDb(['20261104020000_referrals_and_wallet.sql'])
  try {
    await db.query(
      `INSERT INTO auth.users(id,email)
      SELECT md5(i::text)::uuid,'referral-'||i||'@test.invalid' FROM generate_series(1,$1::int) i`,
      [users],
    )
    await db.exec(`INSERT INTO payment_checkouts(id,user_id,product_id,product_snapshot,base_amount,discount,wallet_amount,provider_amount,currency,status)
      SELECT md5(user_id::text||':'||i)::uuid,user_id,'ai_scan_250','{}',5000,0,5000,0,'INR','paid'
      FROM profiles CROSS JOIN LATERAL generate_series(1,CASE WHEN user_id=md5('1')::uuid THEN 100 ELSE 10 END) i;
      INSERT INTO referral_wallet_ledger(user_id,currency,checkout_id,kind,amount)
        SELECT user_id,'INR',id,'spend',-5000 FROM payment_checkouts;
      ANALYZE referral_wallet_ledger;ANALYZE payment_checkouts;`)
    const owner = uuid(1)
    await db.query(
      `INSERT INTO user_entitlements(user_id,feature_id,status,valid_until) VALUES($1,'lifetime_premium','active',NULL)
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status='active',valid_until=NULL`,
      [owner],
    )
    await db.query(
      `INSERT INTO transactions(user_id,product_id,amount,currency,status,type,feature_id,razorpay_order_id,razorpay_payment_id)
      VALUES($1,'lifetime_premium',30000,'INR','captured','lifetime','lifetime_premium','benchmark-owner','benchmark-owner-payment')`,
      [owner],
    )
    await db.query(
      "INSERT INTO referral_codes(user_id,code) VALUES($1,'ABCDEF123456')",
      [owner],
    )
    const summary: number[] = []
    const lifecycle: number[] = []
    for (let i = 0; i < samples; i++) {
      let before = performance.now()
      await db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE authenticated')
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ])
        const result = await tx.query<{
          referral_summary: { entries: unknown[] }
        }>('SELECT referral_summary()')
        assert.equal(
          result.rows[0].referral_summary.entries.length,
          50,
          'Ledger summary remains bounded',
        )
      })
      summary.push(performance.now() - before)
      before = performance.now()
      await db.transaction(async (tx) => {
        const buyer = uuid(2 + (i % (users - 1)))
        const checkout = randomUUID()
        await tx.exec('SET LOCAL ROLE authenticated')
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
          buyer,
        ])
        await tx.query("SELECT apply_referral_code('ABCDEF123456')")
        await tx.exec('RESET ROLE')
        const quote = await tx.query<{
          provider_amount: number
          reward: number
        }>("SELECT * FROM prepare_payment_checkout($1,$2,'lifetime_premium')", [
          checkout,
          buyer,
        ])
        assert.equal(quote.rows[0].provider_amount, 24000)
        assert.equal(quote.rows[0].reward, 6000)
        const order = 'benchmark-' + checkout
        await tx.query('SELECT record_checkout_order($1,$2)', [checkout, order])
        const args = [
          order,
          'pay-' + checkout,
          buyer,
          'lifetime_premium',
          24000,
          'INR',
        ]
        await tx.query('SELECT fulfill_payment_order($1,$2,$3,$4,$5,$6)', args)
        await tx.query('SELECT fulfill_payment_order($1,$2,$3,$4,$5,$6)', args)
        const balance = await tx.query<{ balance: number }>(
          'SELECT balance::int FROM referral_wallets WHERE user_id=$1',
          [owner],
        )
        assert.equal(
          balance.rows[0].balance,
          6000,
          'Duplicate capture rewards once',
        )
        await tx.query("SELECT refund_payment_checkout($1,24000,'INR')", [
          'pay-' + checkout,
        ])
        await tx.query("SELECT refund_payment_checkout($1,24000,'INR')", [
          'pay-' + checkout,
        ])
        const refunded = await tx.query<{ balance: number }>(
          'SELECT balance::int FROM referral_wallets WHERE user_id=$1',
          [owner],
        )
        assert.equal(
          refunded.rows[0].balance,
          0,
          'Duplicate refund reverses once',
        )
        await tx.rollback()
      })
      lifecycle.push(performance.now() - before)
    }
    return { summary, lifecycle, users, ledger_rows: users * 10 + 90 }
  } finally {
    await db.close()
  }
}
