import type { NotificationPurpose } from '../_shared/notifications.ts'

export interface ReminderProfile {
  user_id: string
  name: string | null
  time_zone: string | null
  reminders_per_day: number | null
  voice_call_enabled: boolean
  phone: string | null
  deleted_at?: string | null
}

export interface ReminderCheque {
  id: string
  deposit_date: string | null
  cheque_date: string
  remind_before_days: number | null
  business: { id: string; user_id: string }
}

export interface NewNotificationJob {
  id?: string
  user_id: string
  business_id: string
  channel: 'voice'
  purpose: NotificationPurpose
  payload: {
    cheque_ids: string[]
    slot: string
    trigger?: 'manual'
    to_override?: string
    request_id?: string
  }
  scheduled_at: string
  idempotency_key: string
}

/**
 * Service-role-only request body for an on-demand run scoped to one user or
 * business (used by the ops CLI). Bypasses the slot window but still applies
 * every other eligibility and due-cheque rule.
 */
export interface TargetedRunRequest {
  userId?: string
  businessId?: string
  dryRun?: boolean
  toOverride?: string
  /** Makes a repeated manual request idempotent: the same id never queues a second call. */
  requestId?: string
}

export type TargetedRunBlocker =
  | 'profile_not_found'
  | 'business_not_found'
  | 'voice_disabled'
  | 'no_phone'
  | 'no_time_zone'
  | 'invalid_time_zone'
  | 'no_due_cheques'

export interface TargetedRunResult {
  userId: string | null
  localDate: string | null
  blockers: TargetedRunBlocker[]
  businesses: { businessId: string; chequeIds: string[] }[]
  jobIds: string[]
  /** Subset of jobIds that already existed for this requestId (nothing new was queued for them). */
  existingJobIds: string[]
  dryRun: boolean
}
