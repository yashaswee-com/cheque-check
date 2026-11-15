// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

interface Job {
  id: string
  user_id: string
  business_id: null
  channel: string
  purpose: string
  payload: Record<string, never>
  attempts: number
  claim_token: string
}

interface Context {
  state: { providerStarted: boolean }
  metrics: { provider_requests: number; provider_accepted: number }
  skip(job: Job, reason: string): Promise<unknown>
  finalize(
    job: Job,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ): Promise<void>
}

const { createRegistry } = vi.hoisted(() => ({
  createRegistry: vi.fn(),
}))

vi.mock(
  '../../supabase/functions/notifications-dispatcher/channels/registry.ts',
  async (importOriginal) => {
    const actual = await importOriginal<{
      createNotificationChannelRegistry: (...args: unknown[]) => unknown
    }>()
    createRegistry.mockImplementation(actual.createNotificationChannelRegistry)
    return { ...actual, createNotificationChannelRegistry: createRegistry }
  },
)

// Keep Deno-style dependencies outside the root TypeScript project's imports.
let Orchestrator: new (
  db: unknown,
  voice: unknown,
) => { run(size: number): Promise<unknown[]> }

beforeAll(async () => {
  ;({ DispatcherOrchestrator: Orchestrator } = await import(
    /* @vite-ignore */ pathToFileURL(
      resolve(
        'supabase/functions/notifications-dispatcher/orchestrators/dispatcher.orchestrator.ts',
      ),
    ).href
  ))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function setup(channel = 'email') {
  const job: Job = {
    id: 'registry-job',
    user_id: 'user',
    business_id: null,
    channel,
    purpose: 'cheque_reminder',
    payload: {},
    attempts: 1,
    claim_token: 'token',
  }
  const db = {
    claimJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
    markSkipped: vi.fn().mockResolvedValue(undefined),
    markFailedOrRetry: vi.fn().mockResolvedValue(undefined),
    finishDelivery: vi.fn().mockResolvedValue(undefined),
    fetchProfile: vi.fn(),
    startDelivery: vi.fn(),
    startPushDelivery: vi.fn(),
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  return { job, db, log }
}

function runMetric(log: { mock: { calls: unknown[][] } }) {
  const line = log.mock.calls
    .map(([value]) => value)
    .find(
      (value) =>
        typeof value === 'string' &&
        value.includes('"event":"notification.dispatcher.run"'),
    )
  expect(line).toBeTypeOf('string')
  return JSON.parse(String(line))
}

describe('notification channel registry', () => {
  it.each(['email', 'unknown', 'constructor', '__proto__'])(
    'safely skips unregistered channel %s without starting a provider',
    async (channel) => {
      const { job, db, log } = setup(channel)
      expect(await new Orchestrator(db, null).run(1)).toEqual([
        { jobId: job.id, status: 'skipped' },
      ])
      expect(db.markSkipped).toHaveBeenCalledExactlyOnceWith(
        job,
        `channel '${channel}' is not implemented yet`,
      )
      expect(db.markFailedOrRetry).not.toHaveBeenCalled()
      expect(db.fetchProfile).not.toHaveBeenCalled()
      expect(db.startDelivery).not.toHaveBeenCalled()
      expect(db.startPushDelivery).not.toHaveBeenCalled()
      expect(runMetric(log)).toMatchObject({
        skipped: 1,
        provider_requests: 0,
        reconciliation_required: 0,
      })
    },
  )

  it('substitutes a custom handler and passes shared settlement and metrics capabilities', async () => {
    const { job, db, log } = setup()
    const dispatch = vi.fn(async (claimed: Job, context: Context) => {
      context.state.providerStarted = true
      context.metrics.provider_requests++
      context.metrics.provider_accepted++
      await context.finalize(claimed, 'accepted', 'custom-provider-id')
      return {
        jobId: claimed.id,
        status: 'sent',
        providerMessageId: 'custom-provider-id',
      }
    })
    createRegistry.mockReturnValueOnce({ email: { dispatch } })

    expect(await new Orchestrator(db, null).run(1)).toEqual([
      {
        jobId: job.id,
        status: 'sent',
        providerMessageId: 'custom-provider-id',
      },
    ])
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(
      job,
      expect.objectContaining({
        skip: expect.any(Function),
        finalize: expect.any(Function),
      }),
    )
    expect(db.finishDelivery).toHaveBeenCalledExactlyOnceWith(
      job,
      'accepted',
      'custom-provider-id',
      undefined,
    )
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
    expect(runMetric(log)).toMatchObject({
      sent: 1,
      provider_requests: 1,
      provider_accepted: 1,
      reconciliation_required: 0,
    })
  })

  it.each([false, true])(
    'keeps handler crash recovery dependent on providerStarted=%s',
    async (providerStarted) => {
      const { job, db, log } = setup()
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      const dispatch = vi.fn(async (_job: Job, context: Context) => {
        context.state.providerStarted = providerStarted
        throw new Error('Handler crashed')
      })
      createRegistry.mockReturnValueOnce({ email: { dispatch } })

      expect(await new Orchestrator(db, null).run(1)).toEqual([
        { jobId: job.id, status: 'failed', error: 'Handler crashed' },
      ])
      expect(dispatch).toHaveBeenCalledOnce()
      expect(db.finishDelivery).not.toHaveBeenCalled()
      expect(db.markSkipped).not.toHaveBeenCalled()
      if (providerStarted) {
        expect(db.markFailedOrRetry).not.toHaveBeenCalled()
      } else {
        expect(db.markFailedOrRetry).toHaveBeenCalledExactlyOnceWith(
          job,
          'Handler crashed',
        )
      }
      expect(errorLog).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`Dispatch crashed for job ${job.id}`),
        'Handler crashed',
      )
      expect(runMetric(log)).toMatchObject({
        failed_jobs: 1,
        sent: 0,
        reconciliation_required: providerStarted ? 1 : 0,
      })
    },
  )
})
