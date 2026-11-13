// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createMigratedDb, migration } from '@/test/migrated-db'

let db: PGlite
let serial = 100000
let userSerial = 0
const visitor = '90000000-0000-4000-8000-000000000001'
const session = '90000000-0000-4000-8000-000000000002'
const context = JSON.stringify({
  source_url: 'https://example.test/dashboard',
  first_touch: { utm_source: 'meta' },
})
const matching = JSON.stringify({ external_id: ['test-hash'] })
const existing = '10000000-0000-4000-8000-000000000099'
let retainedCheque: string

beforeAll(async () => {
  db = await createMigratedDb([
    '20261031010000_notification_delivery_leases.sql',
    '20261031050000_notification_provider_capacity.sql',
    '20261101110000_free_plan_limits.sql',
    '20261104020000_referrals_and_wallet.sql',
  ])
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN phone_confirmed_at timestamptz,
      ADD COLUMN last_sign_in_at timestamptz;
    INSERT INTO auth.users(id,email,email_confirmed_at,last_sign_in_at)
      VALUES('${existing}','existing@example.test',now(),now());
    INSERT INTO businesses(user_id,name) VALUES('${existing}','Existing');
  `)
  retainedCheque = await cheque(existing, await setupCheque(existing))
  await asUser(
    db,
    existing,
    `SELECT lifecycle_delete('cheques','${retainedCheque}')`,
  )
  await db.exec(migration('20261113000000_event_analytics.sql'))
  await db.exec("UPDATE marketing_configuration SET enabled=true,mode='live'")
}, 120_000)
afterAll(async () => {
  await db?.close()
})

async function newUser(consent = true) {
  const user = `10000000-0000-4000-8000-${String(++userSerial).padStart(12, '0')}`
  await db.exec(
    `INSERT INTO auth.users(id,email) VALUES('${user}','test${userSerial}@example.test')`,
  )
  if (consent) await sync(user, true)
  return user
}
async function sync(user: string, accepted: boolean, explicit = true) {
  return db.query(
    `SELECT marketing_sync('${user}',${accepted},${explicit},now()-interval '1 hour','${context}','${matching}','${visitor}')`,
  )
}
async function count(user: string, event?: string) {
  return Number(
    (
      await db.query<{ count: number }>(
        `SELECT count(*) FROM event_analytics WHERE user_id='${user}'${event ? ` AND event_name='${event}'` : ''}`,
      )
    ).rows[0].count,
  )
}
async function setupCheque(user: string) {
  const b = (
    await db.query<{ id: string }>(
      `INSERT INTO businesses(user_id,name) VALUES('${user}','B') RETURNING id`,
    )
  ).rows[0].id
  const a = (
    await db.query<{ id: string }>(
      `INSERT INTO accounts(business_id,account_name,account_number) VALUES('${b}','A','1') RETURNING id`,
    )
  ).rows[0].id
  const p = (
    await db.query<{ id: string }>(
      `INSERT INTO parties(business_id,name,contact) VALUES('${b}','P','+919876543210') RETURNING id`,
    )
  ).rows[0].id
  return { b, a, p }
}
async function cheque(
  user: string,
  scope: Awaited<ReturnType<typeof setupCheque>>,
  draft = false,
) {
  return (
    await asUser<{ id: string }>(
      db,
      user,
      `
    INSERT INTO cheques(business_id,account_id,party_id,cheque_number,amount,type,cheque_date,status,is_draft)
    VALUES('${scope.b}','${scope.a}','${scope.p}','${++serial}',1,'Outward','2026-11-13',
      ${draft ? 'NULL' : "'Issued'"},${draft}) RETURNING id
  `,
    )
  ).rows[0].id
}

describe('authoritative marketing events', () => {
  it('baselines existing achievements without emitting conversions', async () => {
    await sync(existing, true)
    await db.exec(`SELECT marketing_onboarding('${existing}',true)`)
    expect(await count(existing)).toBe(0)
    await db.exec(`SELECT lifecycle_restore('cheques','${retainedCheque}');
      UPDATE cheques SET notes='baseline edit' WHERE id='${retainedCheque}'`)
    expect(
      (
        await db.query<{ published_count: number }>(
          `SELECT published_count FROM marketing_user_state WHERE user_id='${existing}'`,
        )
      ).rows[0].published_count,
    ).toBe(1)
  })

  it('requires verified signup plus a first session, once only', async () => {
    const user = await newUser()
    await db.exec(
      `UPDATE auth.users SET email_confirmed_at=now() WHERE id='${user}'`,
    )
    await sync(user, true)
    expect(await count(user, 'signup_success')).toBe(0)
    await db.exec(
      `UPDATE auth.users SET last_sign_in_at=now() WHERE id='${user}'`,
    )
    await sync(user, true)
    await sync(user, true)
    expect(await count(user, 'signup_success')).toBe(1)
  })

  it('does not replay a verified signup that happened before consent', async () => {
    const user = await newUser(false)
    await db.exec(`UPDATE auth.users SET email_confirmed_at=now()-interval '2 hours',
      last_sign_in_at=now()-interval '2 hours' WHERE id='${user}'`)
    await sync(user, true)
    expect(await count(user)).toBe(0)
  })

  it('counts published cheques across businesses, not drafts, edits, or restores', async () => {
    const user = await newUser()
    const one = await setupCheque(user),
      two = await setupCheque(user)
    const draft = await cheque(user, one, true)
    expect(await count(user)).toBe(0)
    await asUser(
      db,
      user,
      `UPDATE cheques SET is_draft=false,status='Issued' WHERE id='${draft}'`,
    )
    expect(await count(user, 'first_cheque')).toBe(1)
    await asUser(db, user, `SELECT lifecycle_delete('cheques','${draft}')`)
    await db.exec(`SELECT lifecycle_restore('cheques','${draft}')`)
    await asUser(
      db,
      user,
      `UPDATE cheques SET notes='edited' WHERE id='${draft}'`,
    )
    for (let i = 0; i < 4; i++) await cheque(user, i % 2 ? one : two)
    expect(await count(user, 'first_cheque')).toBe(1)
    expect(await count(user, 'five_cheques')).toBe(1)
  })

  it('does not backfill pre-consent cheque milestones', async () => {
    const user = await newUser(false),
      scope = await setupCheque(user)
    await cheque(user, scope)
    await sync(user, true)
    for (let i = 0; i < 4; i++) await cheque(user, scope)
    expect(await count(user, 'first_cheque')).toBe(0)
    expect(await count(user, 'five_cheques')).toBe(1)
  })

  it('deduplicates page views by browser session and page', async () => {
    const emit = `SELECT marketing_browser_events(NULL,'${visitor}','${session}','/','${context}','${matching}',false)`
    await db.exec(`${emit}; ${emit}`)
    await db.exec(
      `SELECT marketing_browser_events(NULL,'${visitor}','${session}','/signup','${context}','${matching}',false)`,
    )
    expect(
      (
        await db.query(
          `SELECT id FROM event_analytics WHERE visitor_id='${visitor}' AND session_id='${session}'`,
        )
      ).rows,
    ).toHaveLength(2)
  })

  it('records onboarding completion only after saved setup', async () => {
    const user = await newUser()
    await expect(
      db.exec(`SELECT marketing_onboarding('${user}',true)`),
    ).rejects.toMatchObject({ code: '22023' })
    await setupCheque(user)
    await db.exec(`SELECT marketing_onboarding('${user}',false); SELECT marketing_onboarding('${user}',true);
      SELECT marketing_onboarding('${user}',true)`)
    expect(await count(user, 'onboarding_started')).toBe(1)
    expect(await count(user, 'onboarding_completed')).toBe(1)
  })

  it('records only the first blocked free allowance, never merely reaching zero', async () => {
    const user = await newUser()
    await db.exec(`UPDATE user_quotas SET used="limit" WHERE user_id='${user}'`)
    expect(await count(user, 'free_limit_completed')).toBe(0)
    await asUser(db, user, "SELECT consume_user_quota('ai_scan')")
    await asUser(db, user, "SELECT consume_user_quota('voice_reminder')")
    expect(await count(user, 'free_limit_completed')).toBe(1)
  })

  it('records a server-confirmed cheque-cap block only after the rejected write', async () => {
    const user = await newUser(),
      scope = await setupCheque(user)
    for (let i = 0; i < 50; i++) await cheque(user, scope)
    expect(await count(user, 'free_limit_completed')).toBe(0)
    await expect(cheque(user, scope)).rejects.toMatchObject({ code: '53400' })
    await db.exec(`SELECT marketing_blocked('${user}','cheques')`)
    expect(await count(user, 'free_limit_completed')).toBe(1)
  })

  it('records background voice-quota rejection without consuming another credit', async () => {
    const user = await newUser(),
      job = crypto.randomUUID(),
      token = crypto.randomUUID()
    await db.exec(`UPDATE user_quotas SET used="limit" WHERE user_id='${user}' AND feature_id='voice_reminder';
      INSERT INTO notification_jobs(id,user_id,channel,purpose,idempotency_key,status,claim_token,lease_until)
        VALUES('${job}','${user}','voice','sample_voice_test','analytics-${job}','processing','${token}',now()+interval '1 minute')`)
    const result = (
      await db.query<{ outcome: { status: string } }>(
        `SELECT admit_notification_delivery('${job}','${token}','+919800000000') AS outcome`,
      )
    ).rows[0].outcome
    expect(result.status).toBe('quota_exhausted')
    expect(await count(user, 'free_limit_completed')).toBe(1)
    expect(
      (await db.query('SELECT * FROM notification_attempts')).rows,
    ).toHaveLength(0)
  })

  it('retains consented background events after short-lived browser matching expires', async () => {
    const user = await newUser()
    await db.exec(`UPDATE marketing_user_state SET matching_expires_at=now()-interval '1 second',
      context=context||jsonb_build_object('attribution_expires_at',now()-interval '1 second') WHERE user_id='${user}';
      SELECT marketing_maintenance()`)
    await db.exec(`SELECT marketing_milestone('${user}','first_cheque')`)
    expect(await count(user, 'first_cheque')).toBe(1)
    expect(
      (
        await db.query<{ matching: unknown }>(
          `SELECT q.matching FROM marketing_delivery_queue q JOIN event_analytics e ON e.id=q.event_id
        WHERE e.user_id='${user}'`,
        )
      ).rows[0].matching,
    ).toEqual({})
    expect(
      (
        await db.query<{ context: unknown }>(
          `SELECT context FROM event_analytics WHERE user_id='${user}'`,
        )
      ).rows[0].context,
    ).toEqual({ source_url: 'https://example.test/dashboard' })
  })

  it('does not count depleted paid recharge credits as a free trial', async () => {
    const user = await newUser()
    await db.exec(`INSERT INTO transactions(user_id,razorpay_order_id,amount,currency,status,type,feature_id,product_id)
      VALUES('${user}','paid-${user}',5000,'INR','captured','subscription','ai_scanner_sub','ai_scanner_30d');
      UPDATE user_quotas SET used="limit" WHERE user_id='${user}'`)
    await asUser(db, user, "SELECT consume_user_quota('ai_scan')")
    expect(await count(user, 'free_limit_completed')).toBe(0)
  })

  it('records checkout start and verified completion once, using cash and wallet separately', async () => {
    const user = await newUser()
    const id = crypto.randomUUID()
    await db.exec(
      `SELECT prepare_payment_checkout('${id}','${user}','lifetime_premium')`,
    )
    expect(await count(user)).toBe(0)
    await db.exec(`SELECT record_checkout_order('${id}','order-${id}')`)
    expect(await count(user, 'lifetime_purchase_started')).toBe(1)
    await db.exec(`SELECT fulfill_payment_order('order-${id}','payment-${id}','${user}','lifetime_premium',30000,'INR');
      SELECT fulfill_payment_order('order-${id}','payment-${id}','${user}','lifetime_premium',30000,'INR')`)
    expect(await count(user, 'lifetime_purchase_finished')).toBe(1)
    const row = (
      await db.query<{
        details: Record<string, unknown>
      }>(`SELECT details FROM event_analytics
      WHERE user_id='${user}' AND event_name='lifetime_purchase_finished'`)
    ).rows[0]
    expect(row.details).toMatchObject({
      amount_paise: 30000,
      wallet_paise: 0,
      currency: 'INR',
    })
  })

  it('records wallet-only recharge fulfillment with zero external revenue', async () => {
    const user = await newUser(),
      id = crypto.randomUUID()
    await db.exec(`INSERT INTO user_entitlements(user_id,feature_id,status,valid_until)
      VALUES('${user}','ai_scanner_sub','active',now()+interval '30 days');
      INSERT INTO referral_wallets(user_id,currency,balance) VALUES('${user}','INR',5000);
      SELECT prepare_payment_checkout('${id}','${user}','ai_scan_250');
      SELECT fulfill_wallet_checkout('${id}'); SELECT fulfill_wallet_checkout('${id}')`)
    expect(await count(user, 'recharge_purchase_started')).toBe(1)
    expect(await count(user, 'recharge_purchase_finished')).toBe(1)
    const row = (
      await db.query<{
        details: Record<string, unknown>
      }>(`SELECT details FROM event_analytics
      WHERE user_id='${user}' AND event_name='recharge_purchase_finished'`)
    ).rows[0]
    expect(row.details).toMatchObject({ amount_paise: 0, wallet_paise: 5000 })
  })

  it('records trial expiry only after a blocked premium action', async () => {
    const user = await newUser()
    await db.exec(`INSERT INTO user_entitlements(user_id,feature_id,status,valid_until)
      VALUES('${user}','lifetime_premium','trialing',now()-interval '1 day')`)
    expect(await count(user, 'free_limit_completed')).toBe(0)
    await db.exec(`SELECT marketing_blocked('${user}','trial_expired')`)
    expect(await count(user, 'free_limit_completed')).toBe(1)
  })

  it('cancels unsent events on withdrawal and cannot be regranted by a stale heartbeat', async () => {
    const user = await newUser()
    await setupCheque(user)
    await db.exec(`SELECT marketing_onboarding('${user}',true)`)
    await sync(user, false)
    await sync(user, true, false)
    const state = (
      await db.query<{ consent: boolean }>(
        `SELECT consent FROM marketing_user_state WHERE user_id='${user}'`,
      )
    ).rows[0]
    expect(state.consent).toBe(false)
    expect(
      (
        await db.query(
          `SELECT id FROM event_analytics WHERE user_id='${user}' AND delivery_status='cancelled'`,
        )
      ).rows,
    ).toHaveLength(1)
    expect(
      (
        await db.query(
          `SELECT q.event_id FROM marketing_delivery_queue q JOIN event_analytics e ON e.id=q.event_id WHERE e.user_id='${user}'`,
        )
      ).rows,
    ).toHaveLength(0)
  })

  it('preserves a rejection even if it is the first recorded account choice', async () => {
    const user = await newUser(false)
    await sync(user, false)
    await sync(user, true, false)
    expect(
      (
        await db.query<{ consent: boolean }>(
          `SELECT consent FROM marketing_user_state WHERE user_id='${user}'`,
        )
      ).rows[0].consent,
    ).toBe(false)
  })

  it('keeps all analytics and ingress RPCs inaccessible to client roles', async () => {
    const user = await newUser()
    await expect(
      asUser(db, user, 'SELECT * FROM event_analytics'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(db, user, 'SELECT * FROM event_analytics_daily'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(db, user, `SELECT marketing_milestone('${user}','first_cheque')`),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(db, user, 'SELECT * FROM marketing_claim_delivery()'),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('durable delivery and daily reports', () => {
  it('uses leases, shared IDs, major currency units, and deletes delivered payloads', async () => {
    await db.exec(
      "DELETE FROM marketing_delivery_queue; UPDATE event_analytics SET delivery_status='cancelled' WHERE delivery_status='pending'",
    )
    const user = await newUser()
    await db.exec(`SELECT marketing_emit('${user}','recharge_purchase_finished','queue-test',
      '{"amount_paise":1234,"currency":"INR","product_id":"ai_scan_250"}')`)
    type Claim = {
      event_id: string
      lease_token: string
      payload: Record<string, unknown>
    }
    const claim = (
      await db.query<Claim>('SELECT * FROM marketing_claim_delivery(1)')
    ).rows[0]
    expect(claim.payload).toMatchObject({
      event_id: claim.event_id,
      event_name: 'Purchase',
      action_source: 'website',
      custom_data: {
        value: 12.34,
        currency: 'INR',
        content_ids: ['ai_scan_250'],
      },
    })
    expect(
      (await db.query('SELECT * FROM marketing_claim_delivery(1)')).rows,
    ).toHaveLength(0)
    await expect(
      db.exec(
        `SELECT marketing_settle_delivery('${claim.event_id}','${crypto.randomUUID()}','delivered','accepted')`,
      ),
    ).rejects.toMatchObject({ code: '55000' })
    await db.exec(
      `SELECT marketing_settle_delivery('${claim.event_id}','${claim.lease_token}','retry','http_503')`,
    )
    expect(
      (await db.query('SELECT * FROM marketing_claim_delivery(1)')).rows,
    ).toHaveLength(0)
    await db.exec(
      "UPDATE marketing_delivery_queue SET available_at=now()-interval '1 second'",
    )
    const second = (
      await db.query<Claim>('SELECT * FROM marketing_claim_delivery(1)')
    ).rows[0]
    expect(second.event_id).toBe(claim.event_id)
    expect(second.lease_token).not.toBe(claim.lease_token)
    await db.exec(
      `SELECT marketing_settle_delivery('${second.event_id}','${second.lease_token}','delivered','accepted')`,
    )
    expect(
      (await db.query('SELECT * FROM marketing_delivery_queue')).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query<{ delivery_status: string; delivery_attempts: number }>(
          `SELECT delivery_status,delivery_attempts FROM event_analytics WHERE id='${second.event_id}'`,
        )
      ).rows[0],
    ).toMatchObject({ delivery_status: 'delivered', delivery_attempts: 2 })
  })

  it('rechecks consent after claiming, before provider delivery', async () => {
    const user = await newUser()
    await db.exec(`SELECT marketing_milestone('${user}','first_cheque')`)
    const claim = (
      await db.query<{ event_id: string; lease_token: string }>(
        'SELECT * FROM marketing_claim_delivery(1)',
      )
    ).rows[0]
    await sync(user, false)
    expect(
      (
        await db.query<{ valid: boolean }>(
          `SELECT marketing_delivery_valid('${claim.event_id}','${claim.lease_token}') AS valid`,
        )
      ).rows[0].valid,
    ).toBe(false)
  })

  it('aggregates IST days, keeps exact daily unique users, and preserves identifier-free history', async () => {
    const user = await newUser()
    await db.exec(`INSERT INTO event_analytics(event_name,meta_event_name,occurred_at,user_id,dedupe_key,mode,context)
      VALUES('landing_page_view','PageView','2026-10-01T18:29:00Z','${user}','ist-before','live','{}'),
        ('landing_page_view','PageView','2026-10-01T18:31:00Z','${user}','ist-after','live','{}'),
        ('landing_page_view','PageView','2026-10-01T18:32:00Z','${user}','ist-repeat','live','{"first_touch":{"utm_source":"meta"}}');
      INSERT INTO event_analytics(event_name,meta_event_name,occurred_at,user_id,dedupe_key,mode)
        VALUES('signup_success','CompleteRegistration',now()-interval '100 days','${user}','old-retained-aggregate','live');
      UPDATE marketing_configuration SET aggregated_at=NULL;
      SELECT marketing_maintenance()`)
    const days = (
      await db.query<{
        day: string
        event_count: number
        unique_users: number
      }>(
        "SELECT day::text,event_count,unique_users FROM event_analytics_daily WHERE day IN ('2026-10-01','2026-10-02') AND dimensions='{}'",
      )
    ).rows
    expect(days).toEqual(
      expect.arrayContaining([
        { day: '2026-10-01', event_count: 1, unique_users: 1 },
        { day: '2026-10-02', event_count: 2, unique_users: 1 },
      ]),
    )
    expect(
      (
        await db.query(
          "SELECT id FROM event_analytics WHERE dedupe_key='old-retained-aggregate'",
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query(
          "SELECT * FROM event_analytics_daily_totals WHERE event_name='signup_success' AND day=(now()-interval '100 days')::date",
        )
      ).rows.length,
    ).toBeGreaterThan(0)
  })

  it('expires matching payloads within the configured delivery window', async () => {
    const user = await newUser()
    await db.exec(`SELECT marketing_milestone('${user}','first_cheque');
      UPDATE marketing_delivery_queue SET expires_at=now()-interval '1 second';
      UPDATE marketing_user_state SET matching_expires_at=now()-interval '1 second' WHERE user_id='${user}';
      SELECT marketing_maintenance()`)
    expect(
      (await db.query('SELECT * FROM marketing_delivery_queue')).rows,
    ).toHaveLength(0)
    expect(
      (
        await db.query<{ matching: unknown }>(
          `SELECT matching FROM marketing_user_state WHERE user_id='${user}'`,
        )
      ).rows[0].matching,
    ).toBeNull()
    expect(
      (
        await db.query<{ delivery_status: string }>(
          `SELECT delivery_status FROM event_analytics WHERE user_id='${user}'`,
        )
      ).rows[0].delivery_status,
    ).toBe('failed')
  })

  it('erases account-linked raw analytics without resetting operational milestones', async () => {
    const user = await newUser()
    await db.exec(
      `SELECT marketing_milestone('${user}','first_cheque'); SELECT marketing_erase_user('${user}')`,
    )
    expect(await count(user)).toBe(0)
    const state = (
      await db.query<{
        consent: boolean
        milestones: string[]
        matching: unknown
      }>(
        `SELECT consent,milestones,matching FROM marketing_user_state WHERE user_id='${user}'`,
      )
    ).rows[0]
    expect(state).toMatchObject({ consent: false, matching: null })
    expect(state.milestones).toContain('first_cheque')
  })
})
