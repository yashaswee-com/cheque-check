// @vitest-environment node
import { Command } from 'commander'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { opsGroup } from '../commands/ops'
import {
  getProviderHealth,
  type ProviderHealth,
} from '../domain/notification-health'
import { registerGroups } from '../lib/action'
import type { AdminClient } from '../lib/supabase'
import { makeTestContext } from './helpers'
const healthy: ProviderHealth = {
  starts_per_second: 1,
  max_in_flight: 5,
  in_flight: 2,
  expired_slots: 0,
  next_admission_wait_seconds: 0.5,
  throttled_total: 10,
  last_throttled_at: '2026-10-31T12:00:00Z',
}
afterEach(() => {
  process.exitCode = 0
})
describe('read-only shared provider capacity diagnostics', () => {
  it('loads one aggregate RPC without changing jobs or provider slots', async () => {
    const rpc = vi.fn(async () => ({ data: [healthy], error: null }))
    expect(await getProviderHealth({ rpc } as unknown as AdminClient)).toEqual(
      healthy,
    )
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'notification_provider_health',
      {},
    )
  })
  it.each([
    null,
    [],
    [healthy, healthy],
    [{ ...healthy, starts_per_second: 0 }],
    [{ ...healthy, max_in_flight: 101 }],
    [{ ...healthy, in_flight: -1 }],
    [{ ...healthy, next_admission_wait_seconds: Infinity }],
    [{ ...healthy, last_throttled_at: undefined }],
  ])('rejects malformed metrics explicitly', async (data) => {
    const rpc = vi.fn(async () => ({ data, error: null }))
    await expect(
      getProviderHealth({ rpc } as unknown as AdminClient),
    ).rejects.toThrow('invalid provider capacity')
  })
  it('propagates RPC errors', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    }))
    await expect(
      getProviderHealth({ rpc } as unknown as AdminClient),
    ).rejects.toThrow('permission denied')
  })
  it('exposes an explicit nonzero check when expired slots remain', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ ...healthy, expired_slots: 1 }],
      error: null,
    }))
    const { ctx, stdout } = makeTestContext({
      flags: { json: true },
      db: { rpc },
      target: { isProduction: true },
    })
    const program = new Command().option('--json')
    registerGroups(program, [opsGroup], () => ctx)
    await program.parseAsync([
      'node',
      'ops',
      'ops',
      'notification-provider-health',
      '--check',
      '--json',
    ])
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(stdout.text())).toMatchObject({
      ok: true,
      action: 'ops.notification-provider-health',
      data: { alerts: ['expired_provider_slots'] },
    })
    expect(
      opsGroup.actions.find(
        (action) => action.name === 'notification-provider-health',
      )?.mutates,
    ).toBe(false)
  })
})
