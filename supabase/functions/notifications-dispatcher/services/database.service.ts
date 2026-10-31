import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TABLES } from '../../_shared/tables.ts'
import {
  ClaimedJob,
  DispatchCheque,
  DispatchProfile,
  DispatchScope,
} from '../types.ts'

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
      .select('user_id, name, phone, language, voice_call_enabled, deleted_at')
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

  /** Reserves one unit of quota atomically; false means quota is exhausted. */
  async startDelivery(job: ClaimedJob, recipient: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(
      'start_notification_delivery',
      {
        requested_job: job.id,
        requested_token: job.claim_token,
        requested_recipient: recipient,
      },
    )
    if (error) throw error
    if (typeof data !== 'boolean')
      throw new Error('Delivery reservation result was not returned')
    return data
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
