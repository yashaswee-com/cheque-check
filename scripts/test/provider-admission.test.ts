// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, it, expect, vi } from 'vitest'

interface Service {
  startDelivery(
    job: { id: string; claim_token: string },
    recipient: string,
  ): Promise<unknown>
}
let Service: new (client: unknown) => Service
beforeAll(async () => {
  const url = pathToFileURL(
    resolve(
      'supabase',
      'functions',
      'notifications-dispatcher',
      'services',
      'database.service.ts',
    ),
  ).href
  ;({ DispatcherDatabaseService: Service } = await import(
    /* @vite-ignore */ url
  ))
})
describe('provider admission database boundary', () => {
  const job = { id: 'job', claim_token: 'token' }
  it.each([
    [{ status: 'throttled' }, { status: 'throttled' }],
    [{ status: 'quota_exhausted' }, { status: 'quota_exhausted' }],
    [
      { status: 'started', start_before: '2026-10-31T12:00:00Z' },
      { status: 'started', startBefore: Date.parse('2026-10-31T12:00:00Z') },
    ],
  ])(
    'parses explicit admission outcomes and calls the gated RPC',
    async (data, expected) => {
      const rpc = vi.fn(async () => ({ data, error: null }))
      expect(
        await new Service({ rpc }).startDelivery(job, '+919800000000'),
      ).toEqual(expected)
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        'admit_notification_delivery',
        {
          requested_job: 'job',
          requested_token: 'token',
          requested_recipient: '+919800000000',
        },
      )
    },
  )
  it.each([
    null,
    true,
    [],
    {},
    { status: 'started' },
    { status: 'started', start_before: 'bad' },
    { status: 'unknown' },
  ])(
    'rejects malformed responses rather than bypassing throttling',
    async (data) => {
      const rpc = vi.fn(async () => ({ data, error: null }))
      await expect(
        new Service({ rpc }).startDelivery(job, '+919800000000'),
      ).rejects.toThrow('Invalid provider admission')
    },
  )
  it('propagates database errors because a lost response may already have reserved quota', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error('Response lost'),
    }))
    await expect(
      new Service({ rpc }).startDelivery(job, '+919800000000'),
    ).rejects.toThrow('Response lost')
  })
})
