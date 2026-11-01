// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  benchmarkOptions,
  benchmarkBudgetFailures,
  latencySummary,
  runScalingBenchmark,
} from '../scaling-benchmark'

describe('local benchmark input and measurements', () => {
  it('defaults to 10,000 registered users, a 1,000-user active subset and a skewed tenant', () => {
    expect(benchmarkOptions([])).toMatchObject({
      users: 10000,
      activeUsers: 1000,
      hotBusinessCheques: 10000,
      concurrency: 10,
    })
  })
  it.each([
    ['--users', '0'],
    ['--samples', '1.5'],
    ['--concurrency', '101'],
    ['--max-p95-ms', 'NaN'],
    ['--active-users', '10001'],
    ['--users', '10'],
    ['--hot-business-cheques', '1'],
    ['--active-users', '10000', '--cheques-per-business', '1000'],
    ['--url', 'https://example.test'],
  ])(
    'rejects invalid/unbounded inputs and does not accept a remote target: %j',
    (...args) => {
      expect(() => benchmarkOptions(args)).toThrow()
    },
  )
  it('uses nearest-rank percentiles, preserving the raw samples', () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index)
    expect(latencySummary(values)).toEqual({
      samples: 100,
      p50_ms: 50,
      p95_ms: 95,
      p99_ms: 99,
      max_ms: 100,
    })
    expect(values[0]).toBe(100)
    expect(() => latencySummary([])).toThrow()
  })
  it('enforces exact p95 and scheduler budgets, including the boundary', () => {
    const options = { maxP95Ms: 1000, maxSchedulerMs: 40000 }
    expect(
      benchmarkBudgetFailures([{ name: 'page', p95_ms: 1000 }], 40000, options),
    ).toEqual([])
    expect(
      benchmarkBudgetFailures(
        [{ name: 'page', p95_ms: 1000.01 }],
        40000.01,
        options,
      ),
    ).toEqual(['page.p95', 'scheduler.duration'])
  })
  it('executes actual migrations, RLS reads, checkpoint scheduling and simulated accounting in disposable memory', async () => {
    const options = benchmarkOptions([
      '--users',
      '10',
      '--active-users',
      '3',
      '--cheques-per-business',
      '5',
      '--hot-business-cheques',
      '51',
      '--samples',
      '2',
      '--concurrency',
      '2',
    ])
    const report = await runScalingBenchmark(options)
    expect(report.dataset).toEqual({
      registered_users: 10,
      active_users: 3,
      cheques: 61,
      hot_business_cheques: 51,
    })
    expect(report.correctness_verified).toBe(true)
    expect(report.scheduler).toMatchObject({
      enqueued: 3,
      batches: 1,
      idempotent: true,
    })
    expect(report.simulated_delivery).toMatchObject({
      settled: 3,
      accounting_verified: true,
    })
    expect(report.reads).toHaveLength(13)
    expect(report.reads.map((read) => read.name)).toEqual(
      expect.arrayContaining([
        'free_plan_usage',
        'free_cap_check',
        'extended_filters',
        'analytics',
        'inbox_page',
        'inbox_unread',
        'inbox_mark_all',
        'push_registration_and_ownership',
      ]),
    )
    expect(report.reads.every((read) => read.samples === 2)).toBe(true)
    expect(report.push).toEqual({
      queued: 3,
      simulated_accepted: 1,
      quota_independent: true,
    })
    expect(report.scope).toContain('no HTTP')
    expect(report.health).toMatchObject({ pending_due: 0, sent_in_window: 3 })
  }, 30000)
})
