// @vitest-environment node
import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { opsGroup } from '../commands/ops'
import {
  getNotificationHealth,
  notificationHealthAlerts,
  type NotificationHealth,
} from '../domain/notification-health'
import { registerGroups } from '../lib/action'
import type { AdminClient } from '../lib/supabase'
import { makeTestContext } from './helpers'

const healthy: NotificationHealth = {
  pending_due: 0,
  pending_future: 1,
  processing: 0,
  expired_leases: 0,
  reconciliation_required: 0,
  oldest_due_age_seconds: 0,
  sent_in_window: 10,
  failed_in_window: 0,
  skipped_in_window: 0,
  cancelled_in_window: 0,
  incomplete_scheduler_runs: 0,
  oldest_scheduler_age_seconds: 0,
  scheduler_checkpoint_age_seconds: 10,
}
const limits = { maxDueAgeSeconds: 300, maxSchedulerAgeSeconds: 900 }
afterEach(() => {
  process.exitCode = 0
})

describe('notification health adapters and alerts', () => {
  it('loads one aggregate result with a single read-only RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [healthy], error: null })
    expect(
      await getNotificationHealth({ rpc } as unknown as AdminClient, 60),
    ).toEqual(healthy)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('notification_health', {
      requested_window_minutes: 60,
    })
  })
  it.each([
    null,
    [],
    [healthy, healthy],
    [{ ...healthy, pending_due: '1001' }],
    [{ ...healthy, expired_leases: -1 }],
    [{ ...healthy, scheduler_checkpoint_age_seconds: undefined }],
  ])(
    'rejects missing/malformed metrics rather than reporting a healthy default',
    async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null })
      await expect(
        getNotificationHealth({ rpc } as unknown as AdminClient, 60),
      ).rejects.toThrow('invalid notification health')
    },
  )
  it('propagates RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    })
    await expect(
      getNotificationHealth({ rpc } as unknown as AdminClient, 60),
    ).rejects.toThrow('permission denied')
  })
  it('alerts on queue age, expired leases, unresolved provider outcomes and scheduler lag', () => {
    expect(notificationHealthAlerts(healthy, limits)).toEqual([])
    expect(
      notificationHealthAlerts(
        {
          ...healthy,
          pending_due: 1,
          oldest_due_age_seconds: 301,
          expired_leases: 1,
          reconciliation_required: 1,
          incomplete_scheduler_runs: 1,
          oldest_scheduler_age_seconds: 901,
          scheduler_checkpoint_age_seconds: 901,
        },
        limits,
      ),
    ).toEqual([
      'due_queue_lag',
      'expired_worker_leases',
      'provider_reconciliation_required',
      'scheduler_checkpoint_stale',
      'scheduler_window_lag',
    ])
    expect(
      notificationHealthAlerts(
        { ...healthy, scheduler_checkpoint_age_seconds: null },
        limits,
      ),
    ).toEqual(['scheduler_not_observed'])
    expect(
      notificationHealthAlerts(
        {
          ...healthy,
          pending_due: 1,
          oldest_due_age_seconds: 300,
          scheduler_checkpoint_age_seconds: 900,
        },
        limits,
      ),
    ).toEqual([])
  })
  it('registers the CLI as read-only and emits alerting JSON with a nonzero --check exit', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...healthy, reconciliation_required: 1 }],
      error: null,
    })
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
      'notification-health',
      '--check',
      '--json',
    ])
    expect(
      opsGroup.actions.find((action) => action.name === 'notification-health')
        ?.mutates,
    ).toBe(false)
    expect(JSON.parse(stdout.text())).toMatchObject({
      ok: true,
      action: 'ops.notification-health',
      data: { windowMinutes: 60, alerts: ['provider_reconciliation_required'] },
    })
    expect(process.exitCode).toBe(1)
    expect(rpc).toHaveBeenCalledOnce()
  })
})
