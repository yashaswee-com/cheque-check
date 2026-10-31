import type { NotificationPurpose } from '../_shared/notifications.ts'

export type NotificationChannel =
  'voice' | 'whatsapp' | 'email' | 'push' | 'sms'

export interface ClaimedJob {
  id: string
  user_id: string
  business_id: string | null
  channel: NotificationChannel
  purpose: NotificationPurpose
  payload: {
    cheque_ids?: string[]
    slot?: string
    trigger?: string
    /** Set only by service-role callers (ops CLI); users cannot insert jobs. */
    to_override?: string
    request_id?: string
  }
  attempts: number
  claim_token: string
}

export interface DispatchProfile {
  user_id: string
  name: string | null
  phone: string | null
  language: string | null
  voice_call_enabled: boolean
  deleted_at: string | null
}

/** Claim scope for a manual run; absent for the global cron run. */
export interface DispatchScope {
  userId: string
  jobIds: string[]
}

export interface DispatchCheque {
  id: string
  amount: number
  account: { bank: { name: string } | null } | null
}

export interface DispatchResult {
  jobId: string
  /** 'sent' = provider accepted the call; it does not prove it was answered. */
  status: 'sent' | 'skipped' | 'failed'
  error?: string
  providerMessageId?: string
}
