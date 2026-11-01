import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TABLES } from '../../_shared/tables.ts'
import {
  ClaimedJob,
  DispatchCheque,
  DispatchProfile,
  DispatchScope,
  DeliveryAdmission,
} from '../types.ts'
import type {
  BrowserSubscription,
  PushOutcome,
} from '../../_shared/web-push.service.ts'

export class DispatcherDatabaseService {
  constructor(private supabase: SupabaseClient) {}

  /** Atomically claims+locks a batch of due jobs (safe across overlapping ticks). */
  async claimJobs(
    batchSize: number,
    scope?: DispatchScope,
  ): Promise<ClaimedJob[]> {
    const { data, error } = await this.supabase.rpc('claim_notification_jobs', {
      p_batch_size: batchSize,
      ...(scope ? { p_job_ids: scope.jobIds, p_user_id: scope.userId } : {}),
    })
    if (error) throw error
    return (data || []) as unknown as ClaimedJob[]
  }

  async fetchProfile(userId: string): Promise<DispatchProfile | null> {
    const { data, error } = await this.supabase
      .from(TABLES.PROFILES)
      .select(
        'user_id, name, phone, language, currency, voice_call_enabled, deleted_at',
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data as DispatchProfile | null
  }

  async isBusinessActive(businessId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from(TABLES.BUSINESSES)
      .select('id')
      .eq('id', businessId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return data !== null
  }

  async fetchCheques(
    chequeIds: string[],
    businessId: string,
  ): Promise<DispatchCheque[]> {
    if (chequeIds.length === 0) return []

    const rows: DispatchCheque[] = []
    for (let from = 0; from < chequeIds.length; from += 100) {
      const { data, error } = await this.supabase
        .from(TABLES.CHEQUES)
        .select('id, amount, account:accounts(bank:banks(name))')
        .in('id', chequeIds.slice(from, from + 100))
        .eq('business_id', businessId)
        .eq('status', 'Issued')
        .eq('is_draft', false)
        .is('deleted_at', null)
      if (error) throw error
      rows.push(...((data || []) as unknown as DispatchCheque[]))
    }
    return rows
  }

  /** Atomically admits a provider request and reserves quota, or requeues without a retry penalty. */
  async startDelivery(
    job: ClaimedJob,
    recipient: string,
  ): Promise<DeliveryAdmission> {
    const { data, error } = await this.supabase.rpc(
      'admit_notification_delivery',
      {
        requested_job: job.id,
        requested_token: job.claim_token,
        requested_recipient: recipient,
      },
    )
    if (error) throw error
    const result: unknown = data
    if (result && typeof result === 'object' && 'status' in result) {
      if (result.status === 'quota_exhausted' || result.status === 'throttled')
        return { status: result.status }
      if (
        result.status === 'started' &&
        'start_before' in result &&
        typeof result.start_before === 'string'
      ) {
        const startBefore = Date.parse(result.start_before)
        if (Number.isFinite(startBefore))
          return { status: 'started', startBefore }
      }
    }
    throw new Error('Invalid provider admission result')
  }

  /** 'sent' means the provider accepted the call, not that anyone answered. */
  async finishDelivery(
    job: ClaimedJob,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ): Promise<void> {
    const { error } = await this.supabase.rpc('finish_notification_delivery', {
      requested_job: job.id,
      requested_token: job.claim_token,
      requested_outcome: outcome,
      requested_provider_id: providerId,
      requested_error: message,
    })
    if (error) throw error
  }

  async markSkipped(job: ClaimedJob, reason: string): Promise<void> {
    const { error } = await this.supabase.rpc('release_notification_claim', {
      requested_job: job.id,
      requested_token: job.claim_token,
      requested_error: reason,
      requested_skip: true,
    })
    if (error) throw error
  }
  async startPushDelivery(
    job: ClaimedJob,
  ): Promise<
    | { status: 'throttled' }
    | { status: 'skipped' }
    | {
        status: 'started'
        startBefore: number
        subscription: BrowserSubscription
      }
  > {
    const { data, error } = await this.supabase.rpc('admit_push_delivery', {
      requested_job: job.id,
      requested_token: job.claim_token,
    })
    if (error) throw error
    const result: unknown = data
    if (result && typeof result === 'object' && 'status' in result) {
      if (result.status === 'throttled' || result.status === 'skipped')
        return { status: result.status }
      if (
        result.status === 'started' &&
        'start_before' in result &&
        typeof result.start_before === 'string' &&
        'subscription' in result &&
        result.subscription &&
        typeof result.subscription === 'object'
      ) {
        const s = result.subscription
        if (
          'endpoint' in s &&
          typeof s.endpoint === 'string' &&
          'keys' in s &&
          s.keys &&
          typeof s.keys === 'object' &&
          'p256dh' in s.keys &&
          typeof s.keys.p256dh === 'string' &&
          'auth' in s.keys &&
          typeof s.keys.auth === 'string'
        ) {
          const startBefore = Date.parse(result.start_before)
          if (Number.isFinite(startBefore))
            return {
              status: 'started',
              startBefore,
              subscription: {
                endpoint: s.endpoint,
                keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
              },
            }
        }
      }
    }
    throw new Error('Invalid push admission response')
  }

  async finishPushDelivery(
    job: ClaimedJob,
    result: PushOutcome,
  ): Promise<void> {
    const { error } = await this.supabase.rpc('finish_push_delivery', {
      requested_job: job.id,
      requested_token: job.claim_token,
      requested_outcome: result.outcome,
      requested_status: result.status,
    })
    if (error) throw error
  }

  /** attempts has already been incremented by claimJobs()'s UPDATE. */
  async markFailedOrRetry(
    job: ClaimedJob,
    errorMessage: string,
  ): Promise<void> {
    const { error } = await this.supabase.rpc('release_notification_claim', {
      requested_job: job.id,
      requested_token: job.claim_token,
      requested_error: errorMessage,
    })
    if (error) throw error
  }
}
