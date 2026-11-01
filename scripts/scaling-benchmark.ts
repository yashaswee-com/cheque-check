import { strict as assert } from 'node:assert'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { createScalingFixture } from './lib/scaling-fixture'
import { benchmarkPush } from './lib/push-scaling'

export interface BenchmarkOptions {
  users: number
  activeUsers: number
  chequesPerBusiness: number
  hotBusinessCheques: number
  samples: number
  concurrency: number
  maxP95Ms: number
  maxSchedulerMs: number
}

export function benchmarkOptions(args: string[]): BenchmarkOptions {
  const { values } = parseArgs({
    args,
    options: {
      users: { type: 'string', default: '10000' },
      'active-users': { type: 'string', default: '1000' },
      'cheques-per-business': { type: 'string', default: '20' },
      'hot-business-cheques': { type: 'string', default: '10000' },
      samples: { type: 'string', default: '25' },
      concurrency: { type: 'string', default: '10' },
      'max-p95-ms': { type: 'string', default: '1000' },
      'max-scheduler-ms': { type: 'string', default: '40000' },
    },
    allowPositionals: false,
    strict: true,
  })
  function integer(key: keyof typeof values, max: number) {
    const text = values[key]
    const value = Number(text)
    assert(
      typeof text === 'string' &&
        /^\d+$/.test(text) &&
        Number.isSafeInteger(value) &&
        value >= 1 &&
        value <= max,
      `--${key} must be an integer between 1 and ${max}`,
    )
    return value
  }
  const options = {
    users: integer('users', 100000),
    activeUsers: integer('active-users', 10000),
    chequesPerBusiness: integer('cheques-per-business', 1000),
    hotBusinessCheques: integer('hot-business-cheques', 100000),
    samples: integer('samples', 1000),
    concurrency: integer('concurrency', 100),
    maxP95Ms: integer('max-p95-ms', 60000),
    maxSchedulerMs: integer('max-scheduler-ms', 600000),
  }
  assert(
    options.activeUsers <= options.users,
    '--active-users cannot exceed --users',
  )
  assert(
    options.hotBusinessCheques >= options.chequesPerBusiness,
    '--hot-business-cheques cannot be smaller than --cheques-per-business',
  )
  assert(
    (options.activeUsers - 1) * options.chequesPerBusiness +
      options.hotBusinessCheques <=
      1000000,
    'The disposable benchmark is capped at 1,000,000 cheque rows',
  )
  return options
}

export function latencySummary(samples: number[]) {
  assert(
    samples.length > 0 &&
      samples.every((sample) => Number.isFinite(sample) && sample >= 0),
    'Latency samples must be finite and nonnegative',
  )
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (value: number) =>
    sorted[Math.ceil(sorted.length * value) - 1]
  return {
    samples: sorted.length,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    p99_ms: percentile(0.99),
    max_ms: sorted.at(-1)!,
  }
}

export function benchmarkBudgetFailures(
  reads: { name: string; p95_ms: number }[],
  schedulerMs: number,
  options: Pick<BenchmarkOptions, 'maxP95Ms' | 'maxSchedulerMs'>,
) {
  const failures = reads
    .filter((read) => read.p95_ms > options.maxP95Ms)
    .map((read) => `${read.name}.p95`)
  if (schedulerMs > options.maxSchedulerMs) failures.push('scheduler.duration')
  return failures
}

function uuid(text: string) {
  const hex = createHash('md5').update(text).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function runScalingBenchmark(options: BenchmarkOptions) {
  const started = performance.now()
  const db = await createScalingFixture()
  try {
    const runAt = '2026-10-31T03:30:00Z'
    const hotBusiness = uuid('1')
    await db.query(
      `
      INSERT INTO profiles(user_id, voice_call_enabled, time_zone)
      SELECT md5(i::text)::uuid, i <= $2, CASE i % 3 WHEN 0 THEN 'UTC' WHEN 1 THEN 'Asia/Kolkata' ELSE 'America/New_York' END
      FROM generate_series(1, $1::int) i
    `,
      [options.users, options.activeUsers],
    )
    await db.exec(
      'INSERT INTO businesses(id,user_id) SELECT user_id,user_id FROM profiles',
    )
    await db.query(
      `
      INSERT INTO cheques(id,business_id,cheque_number,amount,cheque_date,status)
      SELECT md5(p.user_id::text || ':' || i)::uuid, p.user_id, lpad(i::text,6,'0'), i,
        ($4::timestamptz AT TIME ZONE p.time_zone)::date,
        CASE WHEN i % 4 = 0 THEN 'Cleared' ELSE 'Issued' END
      FROM profiles p CROSS JOIN LATERAL generate_series(1, CASE WHEN p.user_id = $1::uuid THEN $2::int ELSE $3::int END) i
      WHERE p.voice_call_enabled
    `,
      [
        hotBusiness,
        options.hotBusinessCheques,
        options.chequesPerBusiness,
        runAt,
      ],
    )
    await db.exec(`INSERT INTO user_quotas(user_id,feature_id,"limit")
      SELECT user_id,'voice_reminder',5 FROM profiles WHERE voice_call_enabled;
      ANALYZE profiles; ANALYZE businesses; ANALYZE cheques; ANALYZE user_quotas;`)
    const expectedCheques =
      (options.activeUsers - 1) * options.chequesPerBusiness +
      options.hotBusinessCheques
    const count = await db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM cheques',
    )
    assert.equal(count.rows[0].total, expectedCheques, 'Seeded cheque count')
    await db.query(`INSERT INTO notification_inbox(user_id,business_id,kind,event_key)
      SELECT user_id,user_id,'cheque_reminder','benchmark:'||user_id||':'||i
      FROM profiles CROSS JOIN generate_series(1,100) i WHERE voice_call_enabled`)
    await db.exec('ANALYZE notification_inbox')
    const seedMs = performance.now() - started
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      hotBusiness,
    ])
    await db.exec("SET fixture.free_plan = 'on'; SET ROLE authenticated")
    const limit = 50
    const lastOffset =
      Math.floor((options.hotBusinessCheques - 1) / limit) * limit
    type PageRow = { cheque_id: string | null; matching_count: number }
    async function page(offset: number) {
      const { rows } = await db.query<PageRow>(
        'SELECT * FROM cheque_list_page($1, requested_limit := $2, requested_offset := $3)',
        [hotBusiness, limit, offset],
      )
      assert.equal(Number(rows[0].matching_count), options.hotBusinessCheques)
      assert.equal(
        rows.length,
        Math.min(limit, options.hotBusinessCheques - offset),
      )
      assert(rows.every((row) => row.cheque_id))
      assert.equal(new Set(rows.map((row) => row.cheque_id)).size, rows.length)
    }
    const scenarios = [
      {
        name: 'inbox_page',
        async run() {
          const { rows } = await db.query<{
            data: { items: { id: string }[]; next_cursor: string | null }
          }>('SELECT list_notification_inbox() AS data')
          assert.equal(rows[0].data.items.length, 50)
          assert(rows[0].data.next_cursor)
          assert.equal(
            new Set(rows[0].data.items.map((item) => item.id)).size,
            50,
          )
        },
      },
      {
        name: 'inbox_unread',
        async run() {
          const { rows } = await db.query<{ count: number }>(
            'SELECT count_unread_notifications() AS count',
          )
          assert.equal(Number(rows[0].count), 100)
        },
      },
      {
        name: 'inbox_mark_all',
        async run() {
          await db.transaction(async (tx) => {
            const { rows } = await tx.query<{ changed: number }>(
              'SELECT mark_notifications_read(requested_snapshot:=9223372036854775807) AS changed',
            )
            assert.equal(rows[0].changed, 100)
            await tx.rollback()
          })
        },
      },
      { name: 'first_page', run: () => page(0) },
      { name: 'last_page', run: () => page(lastOffset) },
      {
        name: 'extended_filters',
        async run() {
          const { rows } = await db.query<PageRow>(
            `SELECT * FROM cheque_list_page($1, requested_from := '2026-10-31',
              requested_to := '2026-10-31', requested_statuses := ARRAY['Issued','Cleared'],
              requested_min_amount := $2, requested_max_amount := $2, requested_limit := 50)`,
            [hotBusiness, options.hotBusinessCheques],
          )
          assert.equal(Number(rows[0].matching_count), 1)
          assert.equal(
            rows[0].cheque_id,
            uuid(`${hotBusiness}:${options.hotBusinessCheques}`),
          )
        },
      },
      {
        name: 'analytics',
        async run() {
          const { rows } = await db.query<{
            data: {
              series: { outward_count: number; outward_amount: number }[]
              summary: { cheque_count: number }[]
              banks: { id: string | null }[]
            }
          }>(
            `SELECT cheque_analytics($1,'2026-10-31',true,'2026-10-02','2026-10-31') AS data`,
            [hotBusiness],
          )
          const data = rows[0].data
          assert.equal(data.series.length, 30)
          assert.equal(
            data.series.reduce((sum, point) => sum + point.outward_count, 0),
            options.hotBusinessCheques,
          )
          assert.equal(
            data.series.reduce((sum, point) => sum + point.outward_amount, 0),
            (options.hotBusinessCheques * (options.hotBusinessCheques + 1)) / 2,
          )
          assert.equal(
            data.summary.reduce((sum, row) => sum + row.cheque_count, 0),
            options.hotBusinessCheques,
          )
          assert.equal(data.banks.length, 1)
          assert.equal(data.banks[0].id, null)
        },
      },
      {
        name: 'search',
        async run() {
          const { rows } = await db.query<PageRow>(
            'SELECT * FROM cheque_list_page($1, requested_search := $2, requested_limit := 5)',
            [hotBusiness, String(options.hotBusinessCheques).padStart(6, '0')],
          )
          assert.equal(rows.length, 1)
          assert.equal(Number(rows[0].matching_count), 1)
          assert.equal(
            rows[0].cheque_id,
            uuid(`${hotBusiness}:${options.hotBusinessCheques}`),
          )
        },
      },
      {
        name: 'summary',
        async run() {
          const { rows } = await db.query<{
            cheque_count: number
            total_amount: number
          }>("SELECT * FROM cheque_summary($1,'2026-10-31')", [hotBusiness])
          assert.equal(
            rows.reduce((sum, row) => sum + Number(row.cheque_count), 0),
            options.hotBusinessCheques,
          )
          assert.equal(
            rows.reduce((sum, row) => sum + Number(row.total_amount), 0),
            (options.hotBusinessCheques * (options.hotBusinessCheques + 1)) / 2,
          )
        },
      },
      {
        name: 'business_summary',
        async run() {
          const { rows } = await db.query<{ business_id: string }>(
            "SELECT * FROM business_cheque_summaries('2026-10-31')",
          )
          assert.equal(
            rows.length,
            1,
            'Authenticated summaries must not leak another tenant',
          )
          assert.equal(rows[0].business_id, hotBusiness)
        },
      },
      {
        name: 'free_plan_usage',
        async run() {
          const { rows } = await db.query<{
            cheques_used: number
            cheques_limit: number
          }>('SELECT * FROM free_plan_usage()')
          assert.equal(rows.length, 1)
          // Bounded by the cap even for a tenant with far more cheques.
          assert.equal(
            rows[0].cheques_used,
            Math.min(options.hotBusinessCheques, rows[0].cheques_limit),
          )
        },
      },
      {
        name: 'free_cap_check',
        skip: options.hotBusinessCheques < 50,
        async run() {
          const error = await db
            .query(
              "INSERT INTO cheques(id,business_id,cheque_number,amount) VALUES(gen_random_uuid(),$1,'999999',1)",
              [hotBusiness],
            )
            .then(
              () => null,
              (rejection: { code?: string }) => rejection,
            )
          assert.equal(
            error?.code,
            '53400',
            'A free tenant above the cap must be rejected without scanning its history',
          )
        },
      },
    ].filter((scenario) => !('skip' in scenario && scenario.skip))
    for (const scenario of scenarios) await scenario.run()
    const latencies = scenarios.map(() => [] as number[])
    let next = 0
    const readsStarted = performance.now()
    await Promise.all(
      Array.from({ length: options.concurrency }, async () => {
        for (;;) {
          const index = next++
          if (index >= options.samples * scenarios.length) break
          const scenario = index % scenarios.length
          const before = performance.now()
          await scenarios[scenario].run()
          latencies[scenario].push(performance.now() - before)
        }
      }),
    )
    const readsMs = performance.now() - readsStarted
    const reads = scenarios.map((scenario, index) => ({
      name: scenario.name,
      ...latencySummary(latencies[index]),
    }))
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role;",
    )
    const schedulerStarted = performance.now()
    let enqueued = 0
    let batches = 0
    for (;;) {
      const { rows } = await db.query<{ enqueued: number; completed: boolean }>(
        'SELECT * FROM schedule_notification_batch($1,true)',
        [runAt],
      )
      enqueued += rows[0].enqueued
      batches++
      assert(
        batches <= Math.floor(options.users / 200) + 1,
        'Scheduler must terminate within the expected bounded batches',
      )
      if (rows[0].completed) break
    }
    const schedulerMs = performance.now() - schedulerStarted
    assert.equal(
      enqueued,
      options.activeUsers,
      'Every eligible active business must be scheduled',
    )
    const repeated = await db.query<{ enqueued: number }>(
      'SELECT * FROM schedule_notification_batch($1,true)',
      [runAt],
    )
    assert.equal(repeated.rows[0].enqueued, 0, 'Scheduling is idempotent')
    const deliveryStarted = performance.now()
    let settled = 0
    const deliveryTarget = Math.min(options.activeUsers, 200)
    while (settled < deliveryTarget) {
      const { rows } = await db.query<{ id: string; claim_token: string }>(
        'SELECT * FROM claim_notification_jobs($1)',
        [Math.min(5, deliveryTarget - settled)],
      )
      assert(rows.length > 0, 'Pending jobs remain claimable')
      for (const job of rows) {
        const allowed = await db.query<{ allowed: boolean }>(
          'SELECT start_notification_delivery($1,$2,$3) AS allowed',
          [job.id, job.claim_token, '+919800000000'],
        )
        assert.equal(allowed.rows[0].allowed, true)
        const args = [job.id, job.claim_token, `local-benchmark-${job.id}`]
        await db.query(
          "SELECT finish_notification_delivery($1,$2,'accepted',$3)",
          args,
        )
        await db.query(
          "SELECT finish_notification_delivery($1,$2,'accepted',$3)",
          args,
        )
        settled++
      }
    }
    const accounting = await db.query<{ used: number; audits: number }>(
      'SELECT (SELECT sum(used)::int FROM user_quotas) AS used, (SELECT count(*)::int FROM notification_logs) AS audits',
    )
    assert.equal(
      accounting.rows[0].used,
      settled,
      'One reservation per simulated accepted reminder',
    )
    assert.equal(
      accounting.rows[0].audits,
      settled,
      'No duplicate acceptance audits',
    )
    const health = await db.query('SELECT * FROM notification_health(60)')
    const deliveryMs = performance.now() - deliveryStarted
    const push = await benchmarkPush(db, hotBusiness, options.samples)
    assert.equal(push.queued, options.activeUsers)
    reads.push({
      name: 'push_registration_and_ownership',
      ...latencySummary(push.timings),
    })
    const budgetFailures = benchmarkBudgetFailures(reads, schedulerMs, options)
    return {
      version: 1,
      engine: 'PGlite in-memory, single serialized database connection',
      scope:
        'Local SQL regression benchmark; no HTTP, network, browser rendering, real provider calls, or production concurrency claims',
      options,
      dataset: {
        registered_users: options.users,
        active_users: options.activeUsers,
        cheques: expectedCheques,
        hot_business_cheques: options.hotBusinessCheques,
      },
      seed_ms: seedMs,
      reads,
      read_requests_per_second:
        (options.samples * scenarios.length * 1000) / readsMs,
      scheduler: {
        enqueued,
        batches,
        duration_ms: schedulerMs,
        idempotent: true,
      },
      simulated_delivery: {
        settled,
        duration_ms: deliveryMs,
        accounting_verified: true,
      },
      push: {
        queued: push.queued,
        simulated_accepted: push.simulated_accepted,
        quota_independent: push.quota_independent,
      },
      health: health.rows[0],
      total_ms: performance.now() - started,
      correctness_verified: true,
      budget_failures: budgetFailures,
      passed: budgetFailures.length === 0,
    }
  } finally {
    await db.close()
  }
}

export async function main(args = process.argv.slice(2)) {
  try {
    const report = await runScalingBenchmark(benchmarkOptions(args))
    console.log(JSON.stringify(report, null, 2))
    if (!report.passed) {
      console.error(
        'Local latency budget exceeded; inspect the JSON results and rerun on an idle machine before comparing baselines.',
      )
      process.exitCode = 1
    }
  } catch (error) {
    console.error(
      'Scaling benchmark failed:',
      error instanceof Error ? error.message : String(error),
    )
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main()
