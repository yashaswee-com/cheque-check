import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TABLES } from '../../_shared/tables.ts'
import {
  NewNotificationJob,
  ReminderCheque,
  ReminderProfile,
} from '../types.ts'

export class SchedulerDatabaseService {
  constructor(private supabase: SupabaseClient) {}

  async scheduleBatch(now: Date, forceRun: boolean) {
    const { data, error } = await this.supabase.rpc(
      'schedule_notification_batch',
      {
        requested_now: now.toISOString(),
        requested_force: forceRun,
      },
    )
    if (error) throw error
    if (!data?.length)
      throw new Error('Scheduler batch metadata was not returned')
    return data[0] as {
      enqueued: number
      completed: boolean
      invalid_timezones: number
    }
  }

  async fetchProfile(userId: string): Promise<ReminderProfile | null> {
    const { data, error } = await this.supabase
      .from(TABLES.PROFILES)
      .select(
        'user_id, name, time_zone, reminders_per_day, voice_call_enabled, phone',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return (data as unknown as ReminderProfile) ?? null
  }

  async fetchBusinessOwner(businessId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from(TABLES.BUSINESSES)
      .select('user_id')
      .eq('id', businessId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return (data?.user_id as string | undefined) ?? null
  }

  async insertJobs(jobs: NewNotificationJob[]): Promise<void> {
    if (jobs.length === 0) return

    const { error } = await this.supabase
      .from(TABLES.NOTIFICATION_JOBS)
      .insert(jobs)

    if (error) throw error
  }

  /**
   * Broad candidate set for a user: deposit_date hasn't passed yet, or (no
   * deposit_date) cheque_date is today. The remind_before_days countdown
   * window is narrowed further in JS (see scheduler.orchestrator.ts) since
   * it isn't expressible as a single PostgREST filter.
   */
  async fetchActiveChequesForUser(
    userId: string,
    localToday: string,
  ): Promise<ReminderCheque[]> {
    const rows: ReminderCheque[] = []
    let cursor: string | undefined
    for (;;) {
      let query = this.supabase
        .from(TABLES.CHEQUES)
        .select(
          `
        id, deposit_date, cheque_date, remind_before_days,
        business:businesses!inner(id, user_id)
      `,
        )
        .eq('business.user_id', userId)
        .is('business.deleted_at', null)
        .is('deleted_at', null)
        .eq('status', 'Issued')
        .eq('is_draft', false)
        .or(
          `deposit_date.gte.${localToday},and(deposit_date.is.null,cheque_date.eq.${localToday})`,
        )
        .order('id')
        .limit(500)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error) throw error
      const page = (data || []) as unknown as ReminderCheque[]
      rows.push(...page)
      if (page.length < 500) return rows
      cursor = page[page.length - 1].id
    }
  }

  /** Existing jobs for idempotency keys, so a repeated request reports the original jobs. */
  async fetchJobIdsByKeys(keys: string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map()

    const { data, error } = await this.supabase
      .from(TABLES.NOTIFICATION_JOBS)
      .select('id, idempotency_key')
      .in('idempotency_key', keys)

    if (error) throw error
    return new Map(
      (data || []).map((row: { id: string; idempotency_key: string }) => [
        row.idempotency_key,
        row.id,
      ]),
    )
  }

  async enqueueJobs(jobs: NewNotificationJob[]): Promise<void> {
    if (jobs.length === 0) return

    const { error } = await this.supabase
      .from(TABLES.NOTIFICATION_JOBS)
      .upsert(jobs, { onConflict: 'idempotency_key', ignoreDuplicates: true })

    if (error) throw error
  }
}
