// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type Batch = { enqueued: number; completed: boolean; invalid_timezones: number }
type Scheduler = {
  run(
    now?: Date,
    force?: boolean,
  ): Promise<{ enqueued: number; completed: boolean }>
}
let SchedulerOrchestrator: new (db: {
  scheduleBatch: (now: Date, force: boolean) => Promise<Batch>
}) => Scheduler
beforeAll(async () => {
  const url = pathToFileURL(
    resolve(
      'supabase',
      'functions',
      'notifications-scheduler',
      'orchestrators',
      'scheduler.orchestrator.ts',
    ),
  ).href
  ;({ SchedulerOrchestrator } = await import(/* @vite-ignore */ url))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function recorded(log: { mock: { calls: unknown[][] } }) {
  const json = log.mock.calls
    .map((call) => call[0])
    .find(
      (value) =>
        typeof value === 'string' &&
        value.startsWith(
          '{"level":"info","event":"notification.scheduler.run"',
        ),
    )
  return JSON.parse(String(json))
}

describe('scheduler run metrics', () => {
  it('reports complete runs, bounded batches, invalid timezone counts and no user data', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduleBatch = vi
      .fn()
      .mockResolvedValueOnce({
        enqueued: 200,
        completed: false,
        invalid_timezones: 1,
      })
      .mockResolvedValueOnce({
        enqueued: 3,
        completed: true,
        invalid_timezones: 0,
      })
    expect(await new SchedulerOrchestrator({ scheduleBatch }).run()).toEqual({
      enqueued: 203,
      completed: true,
    })
    expect(recorded(log)).toMatchObject({
      batches: 2,
      enqueued: 203,
      completed: true,
      invalid_timezones: 1,
      budget_exhausted: false,
      failed: false,
    })
    expect(recorded(log).duration_ms).toBeGreaterThanOrEqual(0)
  })
  it('reports checkpoint pauses when the invocation budget is reached', async () => {
    vi.useFakeTimers()
    const start = new Date('2026-10-31T00:00:00Z')
    vi.setSystemTime(start)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const scheduleBatch = vi.fn(async () => {
      vi.setSystemTime(new Date(start.getTime() + 40001))
      return { enqueued: 200, completed: false, invalid_timezones: 0 }
    })
    expect(await new SchedulerOrchestrator({ scheduleBatch }).run()).toEqual({
      enqueued: 200,
      completed: false,
    })
    expect(recorded(log)).toMatchObject({
      batches: 1,
      duration_ms: 40001,
      budget_exhausted: true,
      failed: false,
    })
  })
  it('propagates failures and emits partial counts rather than a success-shaped completion', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const scheduleBatch = vi
      .fn()
      .mockResolvedValueOnce({
        enqueued: 200,
        completed: false,
        invalid_timezones: 0,
      })
      .mockRejectedValueOnce(new Error('database unavailable'))
    await expect(
      new SchedulerOrchestrator({ scheduleBatch }).run(),
    ).rejects.toThrow('database unavailable')
    expect(recorded(log)).toMatchObject({
      batches: 1,
      enqueued: 200,
      completed: false,
      failed: true,
      budget_exhausted: false,
    })
  })
})
