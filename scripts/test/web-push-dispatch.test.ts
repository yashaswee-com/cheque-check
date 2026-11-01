// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'

type Outcome = { outcome: string; status?: number }
interface Push {
  deliver(subscription: unknown, id: string, language: string): Promise<Outcome>
}
let Service: new (send: unknown) => Push
let Orchestrator: new (
  db: unknown,
  voice: unknown,
  test: unknown,
  push: unknown,
) => { run(size: number): Promise<{ status: string }[]> }
beforeAll(async () => {
  ;({ WebPushService: Service } = await import(
    /* @vite-ignore */ pathToFileURL(
      resolve('supabase', 'functions', '_shared', 'web-push.service.ts'),
    ).href
  ))
  ;({ DispatcherOrchestrator: Orchestrator } = await import(
    /* @vite-ignore */ pathToFileURL(
      resolve(
        'supabase',
        'functions',
        'notifications-dispatcher',
        'orchestrators',
        'dispatcher.orchestrator.ts',
      ),
    ).href
  ))
})
describe('Web Push sender and dispatcher', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'key', auth: 'auth' },
  }
  it('sends only opaque event id and locale, bounded by TTL and HTTP timeout', async () => {
    const send = vi.fn().mockResolvedValue({ statusCode: 201 })
    expect(await new Service(send).deliver(sub, '10', 'hi')).toEqual({
      outcome: 'accepted',
      status: 201,
    })
    expect(send).toHaveBeenCalledWith(
      sub,
      JSON.stringify({ inboxId: '10', language: 'hi' }),
      { TTL: 60, timeout: 10000 },
    )
  })
  it.each([404, 410, 429, 503])(
    'classifies explicit HTTP %s rejection',
    async (statusCode) => {
      const send = vi
        .fn()
        .mockRejectedValue({ statusCode, body: 'private endpoint' })
      expect(await new Service(send).deliver(sub, '10', 'en')).toEqual({
        outcome: 'rejected',
        status: statusCode,
      })
    },
  )
  it('treats timeout as uncertain and never logs endpoint/key data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const send = vi.fn().mockRejectedValue(new Error('private endpoint'))
      expect(await new Service(send).deliver(sub, '10', 'en')).toEqual({
        outcome: 'uncertain',
      })
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Web Push provider outcome is uncertain',
      )
    } finally {
      log.mockRestore()
    }
  })
  it('retries settlement, not the provider request, after a lost database response', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const job = {
        id: 'job',
        user_id: 'user',
        channel: 'push',
        payload: { inbox_id: '10' },
      }
      const db = {
        claimJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
        fetchProfile: vi
          .fn()
          .mockResolvedValue({ language: 'en', deleted_at: null }),
        startPushDelivery: vi
          .fn()
          .mockResolvedValue({
            status: 'started',
            startBefore: Date.now() + 20000,
            subscription: sub,
          }),
        finishPushDelivery: vi
          .fn()
          .mockRejectedValueOnce(new Error('lost'))
          .mockResolvedValue(undefined),
        markFailedOrRetry: vi.fn(),
      }
      const push = {
        deliver: vi
          .fn()
          .mockResolvedValue({ outcome: 'accepted', status: 201 }),
      }
      expect(await new Orchestrator(db, null, undefined, push).run(5)).toEqual([
        { jobId: 'job', status: 'sent' },
      ])
      expect(push.deliver).toHaveBeenCalledOnce()
      expect(db.finishPushDelivery).toHaveBeenCalledTimes(2)
      expect(db.markFailedOrRetry).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
