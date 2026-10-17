import { randomUUID } from 'node:crypto'
import { TABLES } from '../../src/lib/supabase/tables'
import { NotFoundError, OpsError, unwrap, unwrapRows } from '../lib/errors'
import {
  invokeFunction,
  type AdminClient,
  type SupabaseCredentials,
} from '../lib/supabase'
import type { JobRow } from './users'

export const SAMPLE_PURPOSE = 'sample_voice_test'
export const QUOTA_EXHAUSTED_ERROR = 'Voice reminder quota exhausted'
export const OPEN_JOB_STATUSES: JobRow['status'][] = ['pending', 'processing']
export const JOB_STATUSES: JobRow['status'][] = [
  'pending',
  'processing',
  'sent',
  'failed',
  'skipped',
  'cancelled',
]

/** Mirrors TargetedRunBlocker in supabase/functions/notifications-scheduler/types.ts. */
export type ReminderBlocker =
  | 'profile_not_found'
  | 'business_not_found'
  | 'voice_disabled'
  | 'no_phone'
  | 'no_time_zone'
  | 'invalid_time_zone'
  | 'no_due_cheques'

export const BLOCKER_HELP: Record<ReminderBlocker, string> = {
  profile_not_found: 'The user has no profile row.',
  business_not_found:
    'The business does not exist, is deleted, or belongs to another user.',
  voice_disabled:
    'Voice reminders are turned off (account profile --voice true).',
  no_phone:
    'The profile has no phone number (account profile --phone, or pass --to).',
  no_time_zone: 'The profile has no time zone (account profile --time-zone).',
  invalid_time_zone: 'The profile time zone is not a valid IANA name.',
  no_due_cheques:
    "No cheques are due for a reminder today in the user's time zone.",
}

export interface TargetedRunResult {
  userId: string | null
  localDate: string | null
  blockers: ReminderBlocker[]
  businesses: { businessId: string; chequeIds: string[] }[]
  jobIds: string[]
  dryRun: boolean
}

/** Runs the scheduler's targeted mode: the same due-cheque rules as the cron run, for one user/business. */
export async function runTargetedSchedule(
  credentials: SupabaseCredentials,
  request: {
    userId?: string
    businessId?: string
    dryRun: boolean
    toOverride?: string
  },
): Promise<TargetedRunResult> {
  const { body } = await invokeFunction<
    TargetedRunResult & { success?: boolean }
  >(credentials, 'notifications-scheduler', request)
  if (!body || !Array.isArray(body.blockers)) {
    throw new OpsError('The scheduler did not return a targeted-run result.', {
      hint: 'Redeploy notifications-scheduler; the deployed version predates targeted runs.',
    })
  }
  return body
}

export interface DispatchSummary {
  processed: number
  results: {
    jobId: string
    status: 'sent' | 'skipped' | 'failed'
    error?: string
  }[]
}

export async function runDispatcher(
  credentials: SupabaseCredentials,
): Promise<DispatchSummary> {
  const { body } = await invokeFunction<DispatchSummary>(
    credentials,
    'notifications-dispatcher',
  )
  return { processed: body?.processed ?? 0, results: body?.results ?? [] }
}

export async function runScheduler(credentials: SupabaseCredentials) {
  const { body } = await invokeFunction<Record<string, unknown>>(
    credentials,
    'notifications-scheduler',
  )
  return body
}

/** Same job the in-app "Test call" button creates. */
export async function insertSampleJob(
  db: AdminClient,
  userId: string,
  toOverride?: string,
): Promise<string> {
  const id = randomUUID()
  unwrap(
    await db.from(TABLES.NOTIFICATION_JOBS).insert({
      id,
      user_id: userId,
      business_id: null,
      channel: 'voice',
      purpose: SAMPLE_PURPOSE,
      payload: {
        trigger: 'ops',
        ...(toOverride ? { to_override: toOverride } : {}),
      },
      scheduled_at: new Date().toISOString(),
      idempotency_key: `${SAMPLE_PURPOSE}:${userId}:${id}`,
    }),
    'Queuing sample call',
  )
  return id
}

export async function getJobs(
  db: AdminClient,
  ids: string[],
): Promise<JobRow[]> {
  if (ids.length === 0) return []
  return unwrapRows(
    await db.from(TABLES.NOTIFICATION_JOBS).select('*').in('id', ids),
    'Loading jobs',
  )
}

/** Polls until every job leaves pending/processing or the timeout passes. */
export async function waitForJobs(
  db: AdminClient,
  ids: string[],
  options: {
    timeoutMs?: number
    intervalMs?: number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<{ jobs: JobRow[]; timedOut: boolean }> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 2_000
  const sleep =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const deadline = Date.now() + timeoutMs
  let jobs = await getJobs(db, ids)
  while (jobs.some((job) => OPEN_JOB_STATUSES.includes(job.status))) {
    if (Date.now() >= deadline) return { jobs, timedOut: true }
    await sleep(intervalMs)
    jobs = await getJobs(db, ids)
  }
  return { jobs, timedOut: false }
}

export async function listJobs(
  db: AdminClient,
  filters: { userId?: string; status?: JobRow['status']; limit: number },
): Promise<JobRow[]> {
  let query = db
    .from(TABLES.NOTIFICATION_JOBS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.status) query = query.eq('status', filters.status)
  return unwrapRows(await query, 'Listing jobs')
}

export async function getJob(db: AdminClient, id: string): Promise<JobRow> {
  const job = unwrap(
    await db
      .from(TABLES.NOTIFICATION_JOBS)
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    'Loading job',
  )
  if (!job) throw new NotFoundError(`No notification job with id ${id}.`)
  return job
}

export async function getJobLogs(db: AdminClient, jobId: string) {
  return unwrapRows(
    await db
      .from(TABLES.NOTIFICATION_LOGS)
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
    'Loading job logs',
  )
}

/**
 * Updates a job only if it is still in one of `fromStatuses`, so a job the
 * dispatcher claimed in the meantime is never clobbered.
 */
export async function transitionJob(
  db: AdminClient,
  id: string,
  fromStatuses: JobRow['status'][],
  patch: Partial<JobRow>,
): Promise<JobRow> {
  const row = unwrap(
    await db
      .from(TABLES.NOTIFICATION_JOBS)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', fromStatuses)
      .select('*')
      .maybeSingle(),
    'Updating job',
  )
  if (!row) {
    throw new OpsError(
      `Job ${id} changed status while you were confirming; nothing was updated.`,
      { hint: 'Inspect it again with `voice jobs-inspect`.' },
    )
  }
  return row
}

export function describeJobOutcome(
  job: Pick<JobRow, 'status' | 'last_error'>,
): string {
  switch (job.status) {
    case 'sent':
      return 'Call placed.'
    case 'skipped':
      return job.last_error === QUOTA_EXHAUSTED_ERROR
        ? 'Skipped: the user has no Voice Reminder quota left (quota topup voice).'
        : `Skipped: ${job.last_error ?? 'no reason recorded'}`
    case 'failed':
      return `Failed: ${job.last_error ?? 'no error recorded'}`
    case 'pending':
      return job.last_error
        ? `Pending retry after error: ${job.last_error}`
        : 'Still queued; the next dispatcher run will pick it up.'
    case 'processing':
      return 'Being processed by the dispatcher.'
    case 'cancelled':
      return 'Cancelled.'
  }
}
