import { randomUUID } from 'node:crypto'
import { defineAction, type GroupDef, type OptionDef } from '../lib/action'
import { writeAudit } from '../lib/audit'
import type { OpsContext, SelectedUser } from '../lib/context'
import { OpsError, UsageError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { confirmMutation, type Change } from '../lib/guards'
import { parseInteger, parsePhone, parseUuid } from '../lib/validators'
import {
  getEntitlement,
  getQuota,
  hasAccess,
  METERED,
  quotaRemaining,
  quotaUsable,
} from '../domain/monetization'
import {
  BLOCKER_HELP,
  describeJobOutcome,
  getJob,
  getJobLogs,
  insertSampleJob,
  JOB_STATUSES,
  listJobs,
  planReminderCalls,
  runDispatcher,
  runScheduler,
  runTargetedSchedule,
  transitionJob,
  waitForJobs,
  type DispatchSummary,
  type TargetedRunResult,
} from '../domain/notifications'
import {
  getProfile,
  listBusinesses,
  type JobRow,
  type ProfileRow,
  type QuotaRow,
} from '../domain/users'
import { expiryLabel, jobTable, quotaSummary } from './render'
import {
  askOptional,
  askValue,
  LIMIT_OPTION,
  selectUser,
  USER_OPTION,
} from './shared'

const VOICE = METERED.voice
const TO_OPTION: OptionDef = {
  flags: '--to <phone>',
  description:
    'Call this number instead of the profile phone (e.g. a support phone for testing)',
}
const WAIT_OPTION: OptionDef = {
  flags: '--wait <seconds>',
  description: 'How long to wait for the call result',
  defaultValue: '45',
}
const NO_DISPATCH_OPTION: OptionDef = {
  flags: '--no-dispatch',
  description:
    'Only queue the job; let the dispatcher cron (every 2 min) place the call',
}
const REQUEST_ID_OPTION: OptionDef = {
  flags: '--request-id <uuid>',
  description:
    'Idempotency key: repeating a request with the same id never queues a second call',
}
const JOB_OPTION: OptionDef = {
  flags: '--id <job_id>',
  description: 'Notification job id',
}

async function askBusiness(
  ctx: OpsContext,
  user: SelectedUser,
  value: unknown,
) {
  const businesses = await listBusinesses(ctx.db(), user.userId)
  if (value) {
    const id = parseUuid(String(value), '--business')
    const match = businesses.find((business) => business.id === id)
    if (!match)
      throw new UsageError(
        `Business ${id} is not an active business of ${user.label}.`,
      )
    return match
  }
  if (businesses.length === 0) {
    throw new UsageError(`${user.label} has no active businesses.`)
  }
  if (businesses.length === 1) return businesses[0]
  if (!ctx.flags.interactive) {
    throw new UsageError(
      `${user.label} has ${businesses.length} businesses; pass --business <id>.`,
      `Businesses: ${businesses.map((business) => `${business.id} ${business.name}`).join('; ')}`,
    )
  }
  const id = await ctx.prompt.select({
    message: 'Which business?',
    choices: businesses.map((business) => ({
      value: business.id,
      name: business.name,
      description: business.phone ?? undefined,
    })),
  })
  return businesses.find((business) => business.id === id) ?? businesses[0]
}

/** Notes about the quota pool, which the dispatcher consumes one unit from per call. */
function quotaNotes(quota: QuotaRow | null, calls: number): string[] {
  if (!quota)
    return [
      `The user has no ${VOICE.label} quota: the dispatcher will skip the call (quota topup).`,
    ]
  if (!quotaUsable(quota)) {
    return [
      `The ${VOICE.label} quota expired ${formatDateTime(quota.reset_at)}: the call will be skipped (quota sub).`,
    ]
  }
  const remaining = quotaRemaining(quota)
  if (remaining < calls) {
    return [
      `Only ${remaining} ${VOICE.label} left for ${calls} call(s): extra calls will be skipped (quota topup).`,
    ]
  }
  return [`Uses ${calls} of ${remaining} remaining ${VOICE.label}.`]
}

export interface CallOutcome {
  userId: string
  jobIds: string[]
  dispatched: boolean
  dispatch?: DispatchSummary
  jobs: JobRow[]
  timedOut: boolean
}

/** Dispatches now (unless disabled) and waits for the given jobs to settle. */
async function dispatchAndWait(
  ctx: OpsContext,
  userId: string,
  jobIds: string[],
  options: Record<string, unknown>,
): Promise<CallOutcome> {
  if (options.dispatch === false || jobIds.length === 0) {
    return { userId, jobIds, dispatched: false, jobs: [], timedOut: false }
  }
  const waitSeconds = parseInteger(String(options.wait ?? 45), '--wait', {
    min: 0,
    max: 600,
  })
  const dispatch = await ctx.ui.spin('Running the dispatcher', () =>
    runDispatcher(ctx.credentials(), { userId, jobIds }),
  )
  const { jobs, timedOut } = await ctx.ui.spin(
    'Waiting for the call result',
    () => waitForJobs(ctx.db(), jobIds, { timeoutMs: waitSeconds * 1000 }),
  )
  return { userId, jobIds, dispatched: true, dispatch, jobs, timedOut }
}

function renderCall(ctx: OpsContext, outcome: CallOutcome) {
  if (!outcome.dispatched) {
    ctx.ui.success(
      `Queued ${outcome.jobIds.length} job(s): ${outcome.jobIds.join(', ')}.`,
    )
    ctx.ui.info(
      'The dispatcher cron places the call within ~2 minutes. Check with `voice jobs-inspect --id <id>`.',
    )
    return
  }
  for (const job of outcome.jobs) {
    const providerId = outcome.dispatch?.results.find(
      (result) => result.jobId === job.id,
    )?.providerMessageId
    const line = `${job.id}: ${describeJobOutcome(job)}${providerId ? ` (provider id ${providerId})` : ''}`
    if (job.status === 'sent') ctx.ui.success(line)
    else if (job.status === 'failed' || job.status === 'skipped')
      ctx.ui.warn(line)
    else ctx.ui.info(line)
  }
  if (outcome.timedOut) {
    ctx.ui.info(
      'Still in progress; check again with `voice jobs-inspect --id <id>`.',
    )
  }
}

function blockerError(preview: TargetedRunResult): OpsError {
  return new OpsError(
    `The reminder cannot be sent: ${preview.blockers.join(', ')}.`,
    {
      hint: preview.blockers
        .map((blocker) => `• ${BLOCKER_HELP[blocker]}`)
        .join('\n'),
    },
  )
}

interface TriggerScope {
  user: SelectedUser
  /** One business, or null for every eligible business of the user. */
  business: { id: string; name: string } | null
}

async function triggerReminders(
  ctx: OpsContext,
  options: Record<string, unknown>,
  scope: TriggerScope,
): Promise<CallOutcome> {
  const { user, business } = scope
  const toOverride = await askOptional(ctx, options.to, {
    message: 'Call a different number instead of the profile phone?',
    parse: (value) => parsePhone(value, '--to'),
  })
  const requestId = options.requestId
    ? parseUuid(String(options.requestId), '--request-id')
    : randomUUID()
  const request = {
    userId: user.userId,
    businessId: business?.id,
    toOverride,
    requestId,
  }
  const [preview, quota, profile] = await ctx.ui.spin(
    'Checking eligibility',
    () =>
      Promise.all([
        runTargetedSchedule(ctx.credentials(), { ...request, dryRun: true }),
        getQuota(ctx.db(), user.userId, VOICE.quotaFeature),
        getProfile(ctx.db(), user.userId),
      ]),
  )
  if (preview.blockers.length > 0) throw blockerError(preview)
  const plan = planReminderCalls(
    preview,
    quota && quotaUsable(quota) ? quotaRemaining(quota) : null,
  )

  await confirmMutation(ctx, {
    title: `Call about ${plan.cheques} due cheque(s) in ${plan.businesses} business(es) � ${user.label}`,
    notes: [
      ...quotaNotes(quota, plan.calls),
      ...(plan.quotaShortfall > 0
        ? [
            `${plan.quotaShortfall} of ${plan.calls} call(s) will be skipped for lack of quota.`,
          ]
        : []),
      ...preview.businesses.map(
        (item) =>
          `Business ${item.businessId}: ${item.chequeIds.length} due cheque(s)`,
      ),
      `Request id ${requestId} (repeat with --request-id to avoid duplicate calls).`,
    ],
    changes: [
      { field: 'environment', before: '', after: ctx.envName },
      {
        field: 'recipient',
        before: '',
        after: toOverride ?? profile?.phone ?? '',
      },
      { field: 'calls', before: '', after: plan.calls },
      { field: 'local date', before: '', after: preview.localDate ?? '' },
      {
        field: 'voice quota',
        before: quotaSummary(quota),
        after: quota
          ? `${quota.used + plan.calls}/${quota.limit} used`
          : 'none',
      },
    ],
  })
  const result = await ctx.ui.spin('Queuing reminder', () =>
    runTargetedSchedule(ctx.credentials(), { ...request, dryRun: false }),
  )
  if (result.blockers.length > 0) throw blockerError(result)
  await writeAudit(ctx, {
    action: business ? 'voice.trigger' : 'voice.trigger_user',
    targetUserId: user.userId,
    targetType: business ? 'business' : 'user',
    targetId: business?.id ?? user.userId,
    after: { jobIds: result.jobIds, businesses: result.businesses },
    metadata: {
      requestId,
      toOverride: toOverride ?? null,
      existingJobIds: result.existingJobIds ?? [],
      dispatch: options.dispatch !== false,
    },
  })
  const outcome = await dispatchAndWait(
    ctx,
    user.userId,
    result.jobIds,
    options,
  )
  if (outcome.dispatched) {
    await writeAudit(ctx, {
      action: 'voice.dispatch',
      targetUserId: user.userId,
      targetType: 'notification_job',
      targetId: outcome.jobIds.join(','),
      after: {
        results: outcome.dispatch?.results ?? [],
        statuses: outcome.jobs.map((job) => ({
          id: job.id,
          status: job.status,
        })),
      },
      metadata: { requestId },
    })
  }
  return outcome
}

const triggerBusiness = defineAction<CallOutcome>({
  name: 'trigger-business',
  title: 'Trigger a voice reminder for a business now',
  description:
    'Places the due-cheque reminder call for one business immediately, using the same rules as the scheduled run (voice enabled, phone, time zone, due cheques). Consumes one Voice Reminder.',
  mutates: true,
  options: [
    USER_OPTION,
    {
      flags: '--business <id>',
      description: 'Business id (asked if the user has several)',
    },
    TO_OPTION,
    REQUEST_ID_OPTION,
    NO_DISPATCH_OPTION,
    WAIT_OPTION,
  ],
  examples: [
    'voice trigger-business --user priya@example.com',
    'voice trigger-business --user <uuid> --business <uuid> --to +919800000000',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const business = await askBusiness(ctx, user, options.business)
    return triggerReminders(ctx, options, { user, business })
  },
  render: renderCall,
})

const triggerUser = defineAction<CallOutcome>({
  name: 'trigger-user',
  title: 'Trigger voice reminders for all of a user�s due businesses now',
  description:
    'Previews, then places one reminder call per business that has due cheques for one user, with the same eligibility rules as the scheduled run. Consumes one Voice Reminder per call; only this user�s jobs are dispatched. Use the global --dry-run to preview only.',
  mutates: true,
  options: [
    USER_OPTION,
    TO_OPTION,
    REQUEST_ID_OPTION,
    NO_DISPATCH_OPTION,
    WAIT_OPTION,
  ],
  examples: [
    'voice trigger-user --user priya@example.com --dry-run',
    'voice trigger-user --user <uuid> --reason "Support #42" --yes',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    return triggerReminders(ctx, options, { user, business: null })
  },
  render: renderCall,
})
const sample = defineAction<CallOutcome>({
  name: 'sample',
  title: 'Place a sample (test) call',
  description:
    'Same as the in-app "Test call" button: a short sample call that does not depend on cheques. Consumes one Voice Reminder.',
  mutates: true,
  options: [USER_OPTION, TO_OPTION, NO_DISPATCH_OPTION, WAIT_OPTION],
  examples: [
    'voice sample --user priya@example.com',
    'voice sample --user <uuid> --to +919800000000',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const toOverride = await askOptional(ctx, options.to, {
      message: 'Call a different number instead of the profile phone?',
      parse: (value) => parsePhone(value, '--to'),
    })
    const [profile, quota] = await Promise.all([
      getProfile(ctx.db(), user.userId),
      getQuota(ctx.db(), user.userId, VOICE.quotaFeature),
    ])
    if (!profile?.voice_call_enabled) {
      throw new UsageError(
        'Voice reminders are turned off for this user.',
        'Turn them on with ccount profile --voice true; sample calls respect the opt-in.',
      )
    }
    const recipient = toOverride ?? profile?.phone
    if (!recipient) {
      throw new UsageError(
        'The profile has no phone number.',
        'Set it with `account profile --phone`, or pass --to.',
      )
    }
    await confirmMutation(ctx, {
      title: `Sample call to ${recipient} · ${user.label}`,
      notes: quotaNotes(quota, 1),
      changes: [
        {
          field: 'voice quota',
          before: quotaSummary(quota),
          after: quota ? `${quota.used + 1}/${quota.limit} used` : 'none',
        },
      ],
    })
    const jobId = await insertSampleJob(ctx.db(), user.userId, toOverride)
    await writeAudit(ctx, {
      action: 'voice.sample',
      targetUserId: user.userId,
      targetType: 'notification_job',
      targetId: jobId,
      metadata: { toOverride: toOverride ?? null },
    })
    return dispatchAndWait(ctx, user.userId, [jobId], options)
  },
  render: renderCall,
})

interface Diagnosis {
  userId: string
  profile: Pick<
    ProfileRow,
    | 'phone'
    | 'time_zone'
    | 'voice_call_enabled'
    | 'language'
    | 'reminders_per_day'
  > | null
  subscriptionActive: boolean
  quota: QuotaRow | null
  preview: TargetedRunResult
  problems: string[]
}

const diagnose = defineAction<Diagnosis>({
  name: 'diagnose',
  title: 'Why is a user not getting reminder calls?',
  description:
    'Read-only checklist: profile settings, subscription, quota, and whether any cheque is due today (a dry run of the scheduler; nothing is queued).',
  mutates: false,
  options: [
    USER_OPTION,
    { flags: '--business <id>', description: 'Only this business' },
  ],
  examples: ['voice diagnose --user priya@example.com'],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const businessId = options.business
      ? parseUuid(String(options.business), '--business')
      : undefined
    const [profile, subscription, quota, preview] = await ctx.ui.spin(
      'Diagnosing',
      () =>
        Promise.all([
          getProfile(ctx.db(), user.userId),
          getEntitlement(ctx.db(), user.userId, VOICE.subFeature),
          getQuota(ctx.db(), user.userId, VOICE.quotaFeature),
          runTargetedSchedule(ctx.credentials(), {
            userId: user.userId,
            businessId,
            dryRun: true,
          }),
        ]),
    )
    const problems = preview.blockers.map((blocker) => BLOCKER_HELP[blocker])
    if (!hasAccess(subscription)) {
      problems.push(
        `No active ${VOICE.subFeature} (subscription ${subscription?.status ?? 'never bought'}).`,
      )
    }
    problems.push(
      ...quotaNotes(quota, 1).filter((note) => !note.startsWith('Uses ')),
    )
    return {
      userId: user.userId,
      profile: profile && {
        phone: profile.phone,
        time_zone: profile.time_zone,
        voice_call_enabled: profile.voice_call_enabled,
        language: profile.language,
        reminders_per_day: profile.reminders_per_day,
      },
      subscriptionActive: hasAccess(subscription),
      quota,
      preview,
      problems,
    }
  },
  render(ctx, diagnosis) {
    const { ui } = ctx
    ui.section('Profile')
    ui.kv({
      'Voice calls': diagnosis.profile?.voice_call_enabled ?? false,
      Phone: diagnosis.profile?.phone,
      'Time zone': diagnosis.profile?.time_zone,
      Language: diagnosis.profile?.language,
      'Reminders/day': diagnosis.profile?.reminders_per_day,
    })
    ui.section('Voice Reminders')
    ui.kv({
      Subscription: diagnosis.subscriptionActive,
      Quota: quotaSummary(diagnosis.quota),
      'Quota resets': diagnosis.quota
        ? expiryLabel(diagnosis.quota.reset_at)
        : '',
    })
    ui.section(`Due today (${diagnosis.preview.localDate ?? 'unknown date'})`)
    ui.table(
      diagnosis.preview.businesses.map((business) => ({
        business: business.businessId,
        due_cheques: business.chequeIds.length,
      })),
      'No cheques due today.',
    )
    ui.section('Verdict')
    if (diagnosis.problems.length === 0) {
      ui.success(
        "Everything looks fine: calls go out in the user's reminder slots. Use `voice trigger-business` to call now.",
      )
    } else {
      for (const problem of diagnosis.problems) ui.warn(problem)
    }
  },
})

const jobs = defineAction<JobRow[]>({
  name: 'jobs',
  title: 'List notification jobs',
  description:
    'Recent voice/notification jobs, optionally for one user or status.',
  mutates: false,
  options: [
    { flags: '--user <query>', description: 'Only this user' },
    {
      flags: '--status <status>',
      description: 'Only this status',
      choices: JOB_STATUSES,
    },
    LIMIT_OPTION,
  ],
  examples: [
    'voice jobs --status failed',
    'voice jobs --user priya@example.com --json',
  ],
  async run(ctx, options) {
    let userId: string | undefined
    if (
      options.user ||
      (ctx.flags.interactive &&
        (await ctx.prompt.confirm('Filter by user?', true)))
    ) {
      userId = (await selectUser(ctx, options.user)).userId
    }
    return listJobs(ctx.db(), {
      userId,
      status: options.status as JobRow['status'] | undefined,
      limit: parseInteger(String(options.limit ?? 20), '--limit', {
        min: 1,
        max: 1000,
      }),
    })
  },
  render(ctx, rows) {
    ctx.ui.table(jobTable(rows), 'No jobs.')
  },
})

async function askJobId(ctx: OpsContext, value: unknown) {
  return askValue(ctx, value, {
    flag: '--id',
    message: 'Job id',
    parse: (input) => parseUuid(input, 'Job id'),
  })
}

type JobDetail = { job: JobRow; logs: Awaited<ReturnType<typeof getJobLogs>> }

const jobsInspect = defineAction<JobDetail>({
  name: 'jobs-inspect',
  title: 'Inspect a job and its provider logs',
  description:
    'Shows a notification job, what happened to it, and every provider attempt.',
  mutates: false,
  options: [JOB_OPTION],
  examples: ['voice jobs-inspect --id <job_id>'],
  async run(ctx, options) {
    const id = await askJobId(ctx, options.id)
    const [job, logs] = await Promise.all([
      getJob(ctx.db(), id),
      getJobLogs(ctx.db(), id),
    ])
    return { job, logs }
  },
  render(ctx, { job, logs }) {
    ctx.ui.kv({
      Job: job.id,
      User: job.user_id,
      Business: job.business_id,
      Purpose: job.purpose,
      Status: job.status,
      Attempts: job.attempts,
      Scheduled: formatDateTime(job.scheduled_at),
      Outcome: describeJobOutcome(job),
      Payload: JSON.stringify(job.payload),
    })
    ctx.ui.section('Provider attempts')
    ctx.ui.table(
      logs.map((log) => ({
        at: formatDateTime(log.created_at),
        status: log.status,
        recipient: log.recipient,
        provider: log.provider,
        message_id: log.provider_message_id,
        error: log.error,
      })),
      'No provider attempts logged.',
    )
  },
})

const RETRYABLE: JobRow['status'][] = ['failed', 'skipped', 'cancelled']

const jobsRetry = defineAction<JobRow>({
  name: 'jobs-retry',
  title: 'Retry a failed/skipped job',
  description:
    'Puts a failed, skipped, or cancelled job back to pending with a fresh attempt budget. Fix the cause first (e.g. top up quota, set phone).',
  mutates: true,
  options: [JOB_OPTION],
  examples: ['voice jobs-retry --id <job_id>'],
  async run(ctx, options) {
    const id = await askJobId(ctx, options.id)
    const job = await getJob(ctx.db(), id)
    if (!RETRYABLE.includes(job.status)) {
      throw new UsageError(
        `Only ${RETRYABLE.join('/')} jobs can be retried (this one is ${job.status}).`,
      )
    }
    const changes: Change[] = [
      { field: 'status', before: job.status, after: 'pending' },
      { field: 'attempts', before: job.attempts, after: 0 },
      { field: 'last error', before: job.last_error ?? '', after: '' },
    ]
    await confirmMutation(ctx, {
      title: `Retry job ${job.id}`,
      notes: [
        'The dispatcher cron picks it up within ~2 minutes. This may consume a Voice Reminder.',
      ],
      changes,
    })
    const after = await transitionJob(ctx.db(), id, RETRYABLE, {
      status: 'pending',
      attempts: 0,
      last_error: null,
      scheduled_at: new Date().toISOString(),
    })
    await writeJobAudit(ctx, 'voice.job_retry', job, after)
    return after
  },
  render(ctx, job) {
    ctx.ui.success(`Job ${job.id} is pending again.`)
  },
})

const jobsCancel = defineAction<JobRow>({
  name: 'jobs-cancel',
  title: 'Cancel a pending job',
  description: 'Stops a queued call from being placed.',
  mutates: true,
  options: [JOB_OPTION],
  examples: ['voice jobs-cancel --id <job_id>'],
  async run(ctx, options) {
    const id = await askJobId(ctx, options.id)
    const job = await getJob(ctx.db(), id)
    if (job.status !== 'pending') {
      throw new UsageError(
        `Only pending jobs can be cancelled (this one is ${job.status}).`,
      )
    }
    await confirmMutation(ctx, {
      title: `Cancel job ${job.id}`,
      changes: [{ field: 'status', before: job.status, after: 'cancelled' }],
    })
    const after = await transitionJob(ctx.db(), id, ['pending'], {
      status: 'cancelled',
    })
    await writeJobAudit(ctx, 'voice.job_cancel', job, after)
    return after
  },
  render(ctx, job) {
    ctx.ui.success(`Job ${job.id} cancelled.`)
  },
})

async function writeJobAudit(
  ctx: OpsContext,
  action: string,
  before: JobRow,
  after: JobRow,
) {
  await writeAudit(ctx, {
    action,
    targetUserId: before.user_id,
    targetType: 'notification_job',
    targetId: before.id,
    before: {
      status: before.status,
      attempts: before.attempts,
      last_error: before.last_error,
    },
    after: {
      status: after.status,
      attempts: after.attempts,
      last_error: after.last_error,
    },
  })
}

interface PipelineOutcome {
  scheduler: Record<string, unknown> | null
  dispatcher: DispatchSummary
}

const pipeline = defineAction<PipelineOutcome>({
  name: 'pipeline',
  title: 'Run the scheduler + dispatcher once (all users)',
  description:
    'Runs one scheduler tick and one dispatcher tick, exactly like the cron. Affects every user whose slot is due; use trigger-business for one user.',
  mutates: true,
  options: [],
  examples: ['voice pipeline --env qa --yes'],
  async run(ctx) {
    await confirmMutation(ctx, {
      title: 'Run notifications-scheduler then notifications-dispatcher',
      notes: [
        'Queues reminders for every user whose slot is due now, then places up to 50 pending calls for ALL users.',
      ],
      changes: [],
    })
    const scheduler = await ctx.ui.spin('Running the scheduler', () =>
      runScheduler(ctx.credentials()),
    )
    const dispatcher = await ctx.ui.spin('Running the dispatcher', () =>
      runDispatcher(ctx.credentials()),
    )
    return { scheduler, dispatcher }
  },
  render(ctx, outcome) {
    ctx.ui.section('Scheduler')
    ctx.ui.print(JSON.stringify(outcome.scheduler, null, 2))
    ctx.ui.section('Dispatcher')
    ctx.ui.table(
      outcome.dispatcher.results.map((result) => ({ ...result })),
      'No pending jobs were processed.',
    )
    ctx.ui.success(
      `Dispatcher processed ${outcome.dispatcher.processed} job(s).`,
    )
  },
})

export const voiceGroup: GroupDef = {
  name: 'voice',
  title: 'Voice reminders: trigger, test, diagnose, jobs',
  description:
    'Place reminder calls on demand and troubleshoot the notification pipeline.',
  actions: [
    triggerBusiness,
    triggerUser,
    sample,
    diagnose,
    jobs,
    jobsInspect,
    jobsRetry,
    jobsCancel,
    pipeline,
  ],
}
