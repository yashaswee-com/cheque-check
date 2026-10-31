import type { Database } from '../../src/types/database.types'
import type { AdminClient } from '../lib/supabase'
import { OpsError, unwrap } from '../lib/errors'

export type NotificationHealth =
  Database['public']['Functions']['notification_health']['Returns'][number]

const countFields = [
  'pending_due',
  'pending_future',
  'processing',
  'expired_leases',
  'reconciliation_required',
  'sent_in_window',
  'failed_in_window',
  'skipped_in_window',
  'cancelled_in_window',
  'incomplete_scheduler_runs',
] as const
const ageFields = [
  'oldest_due_age_seconds',
  'oldest_scheduler_age_seconds',
] as const

export async function getNotificationHealth(
  db: AdminClient,
  windowMinutes: number,
): Promise<NotificationHealth> {
  const rows = unwrap(
    await db.rpc('notification_health', {
      requested_window_minutes: windowMinutes,
    }),
    'Loading notification health',
  )
  const value = rows?.[0]
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !value ||
    countFields.some(
      (key) => !Number.isSafeInteger(value[key]) || value[key] < 0,
    ) ||
    ageFields.some((key) => !Number.isFinite(value[key]) || value[key] < 0) ||
    (value.scheduler_checkpoint_age_seconds !== null &&
      (!Number.isFinite(value.scheduler_checkpoint_age_seconds) ||
        value.scheduler_checkpoint_age_seconds < 0))
  ) {
    throw new OpsError(
      'The database returned invalid notification health metrics.',
      {
        hint: 'Apply the notification_health migration and refresh the PostgREST schema cache.',
      },
    )
  }
  return value
}

export function notificationHealthAlerts(
  value: NotificationHealth,
  limits: { maxDueAgeSeconds: number; maxSchedulerAgeSeconds: number },
): string[] {
  const alerts: string[] = []
  if (
    value.pending_due > 0 &&
    value.oldest_due_age_seconds > limits.maxDueAgeSeconds
  )
    alerts.push('due_queue_lag')
  if (value.expired_leases > 0) alerts.push('expired_worker_leases')
  if (value.reconciliation_required > 0)
    alerts.push('provider_reconciliation_required')
  if (value.scheduler_checkpoint_age_seconds === null)
    alerts.push('scheduler_not_observed')
  else if (
    value.scheduler_checkpoint_age_seconds > limits.maxSchedulerAgeSeconds
  )
    alerts.push('scheduler_checkpoint_stale')
  if (
    value.incomplete_scheduler_runs > 0 &&
    value.oldest_scheduler_age_seconds > limits.maxSchedulerAgeSeconds
  )
    alerts.push('scheduler_window_lag')
  return alerts
}
