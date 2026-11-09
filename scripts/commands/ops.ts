import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { defineAction, type GroupDef } from '../lib/action'
import type { OpsContext } from '../lib/context'
import { toCsv } from '../lib/csv'
import { AbortedError, toOpsError, UsageError } from '../lib/errors'
import { formatDateTime, formatPaise } from '../lib/format'
import { confirmMutation } from '../lib/guards'
import {
  addLocalAllowlistRef,
  LOCAL_ALLOWLIST,
  projectRefFromUrl,
} from '../lib/project'
import { colors } from '../lib/ui'
import { parseDate, parseInteger } from '../lib/validators'
import {
  BULK_ACTIONS,
  BULK_AMOUNT,
  BULK_COLUMNS,
  executeBulkRow,
  isDestructiveBulkAction,
  parseBulkCsv,
  type BulkRow,
} from '../domain/bulk'
import {
  getStats,
  listAudit,
  runDoctor,
  type AuditRow,
  type DoctorCheck,
  type OpsStats,
} from '../domain/ops'
import { searchUsers } from '../domain/users'
import {
  getNotificationHealth,
  getProviderHealth,
  type ProviderHealth,
  notificationHealthAlerts,
  type NotificationHealth,
} from '../domain/notification-health'
import { askValue, LIMIT_OPTION, selectUser } from './shared'
import { feedbackActions } from './feedback'
import { getIncident } from '../domain/incident'

const incident = defineAction<Awaited<ReturnType<typeof getIncident>>>({
  name: 'incident',
  title: 'Read Sentry incident metadata',
  description:
    'Read-only issue summary via the authenticated sentry CLI. No raw events, personal data, or issue-state changes. --env does not filter Sentry events; the latest event environment is shown explicitly.',
  mutates: false,
  options: [
    {
      flags: '--issue <short-id>',
      description: 'Sentry short ID in cheque-check/cheque-check-web',
    },
  ],
  examples: ['ops incident --issue CHEQUE-CHECK-WEB-D --json'],
  run: (_ctx, options) =>
    getIncident(typeof options.issue === 'string' ? options.issue : ''),
  render(ctx, result) {
    ctx.ui.kv({
      Issue: result.shortId,
      URL: result.url,
      Status: result.status,
      Events: result.count,
      'First seen': result.firstSeen,
      'Last seen': result.lastSeen,
      'Latest environment': result.latestEvent?.environment ?? 'unknown',
      'Latest release': result.latestEvent?.release ?? 'unknown',
    })
  },
})

const STATUS_ICON = {
  ok: colors.green('✔'),
  warn: colors.yellow('!'),
  fail: colors.red('✖'),
}

const doctor = defineAction<DoctorCheck[]>({
  name: 'doctor',
  title: 'Check the CLI setup for this environment',
  description:
    'Read-only: env vars, production guard, operator, database connectivity, admin_ops migration, deployed edge functions, and hosted Supabase Auth URLs. Production checks require --expected-site-url and SUPABASE_ACCESS_TOKEN. Exits 1 if anything fails.',
  mutates: false,
  options: [
    {
      flags: '--expected-site-url <url>',
      description: 'Expected production site origin (e.g. https://example.com)',
    },
  ],
  examples: [
    'ops doctor',
    'ops doctor --env qa --json',
    'ops doctor --env prod --expected-site-url https://example.com --json',
  ],
  async run(ctx, options) {
    const checks = await ctx.ui.spin('Checking', () =>
      runDoctor(ctx, {
        expectedSiteUrl:
          typeof options.expectedSiteUrl === 'string'
            ? options.expectedSiteUrl
            : undefined,
        requireAuthUrlCheck: ctx.envName === 'prod' || ctx.target.isProduction,
      }),
    )
    if (checks.some((check) => check.status === 'fail')) process.exitCode = 1
    return checks
  },
  render(ctx, checks) {
    for (const check of checks) {
      ctx.ui.print(
        `${STATUS_ICON[check.status]} ${colors.bold(check.name)}: ${check.detail}`,
      )
      if (check.hint && check.status !== 'ok')
        ctx.ui.print(`    ${colors.dim(check.hint)}`)
    }
    const failed = checks.filter((check) => check.status === 'fail').length
    if (failed) ctx.ui.error(`${failed} check(s) failed.`)
    else ctx.ui.success('Ready.')
  },
})

const stats = defineAction<OpsStats>({
  name: 'stats',
  title: 'Show key numbers',
  description:
    'Users, premium/subscription counts, payments in the last 30 days, and voice job outcomes in the last 24 hours.',
  mutates: false,
  options: [],
  examples: ['ops stats', 'ops stats --env prod --json'],
  run: (ctx) => ctx.ui.spin('Counting', () => getStats(ctx.db())),
  render(ctx, value) {
    ctx.ui.section('Users')
    ctx.ui.kv({
      Users: value.users,
      Businesses: value.businesses,
      Cheques: value.cheques,
    })
    ctx.ui.section('Premium')
    ctx.ui.kv({
      'Lifetime active': value.lifetimeActive,
      'Lifetime trialing': value.lifetimeTrialing,
      'Voice subscriptions': value.voiceSubsActive,
      'AI subscriptions': value.aiSubsActive,
    })
    ctx.ui.section('Last 30 days')
    ctx.ui.kv({
      'Captured payments': value.capturedPayments30d,
      Revenue: formatPaise(value.revenue30dPaise),
    })
    ctx.ui.section('Voice jobs, last 24 hours')
    ctx.ui.kv(value.jobs24h)
    ctx.ui.section('Admin changes, last 7 days')
    ctx.ui.kv({ 'Audit entries': value.audit7d })
  },
})

const notificationHealth = defineAction<{
  windowMinutes: number
  metrics: NotificationHealth
  alerts: string[]
}>({
  name: 'notification-health',
  title: 'Check reminder backlog and scheduler lag',
  description:
    'Read-only aggregate metrics; no calls, retries, quota changes, or personal data. --check exits 1 if an alert is present.',
  mutates: false,
  options: [
    {
      flags: '--window-minutes <minutes>',
      description: 'Recent job outcomes window (1..1440)',
      defaultValue: '60',
    },
    {
      flags: '--max-due-age-seconds <seconds>',
      description: 'Alert when the oldest due job exceeds this age',
      defaultValue: '300',
    },
    {
      flags: '--max-scheduler-age-seconds <seconds>',
      description: 'Alert on stale checkpoints or incomplete windows',
      defaultValue: '900',
    },
    { flags: '--check', description: 'Exit 1 if any health alert is present' },
  ],
  examples: [
    'ops notification-health --env qa --json',
    'ops notification-health --env prod --check --json',
  ],
  async run(ctx, options) {
    const windowMinutes = parseInteger(
      String(options.windowMinutes),
      '--window-minutes',
      { min: 1, max: 1440 },
    )
    const limits = {
      maxDueAgeSeconds: parseInteger(
        String(options.maxDueAgeSeconds),
        '--max-due-age-seconds',
        { min: 1, max: 86400 },
      ),
      maxSchedulerAgeSeconds: parseInteger(
        String(options.maxSchedulerAgeSeconds),
        '--max-scheduler-age-seconds',
        { min: 1, max: 86400 },
      ),
    }
    const metrics = await getNotificationHealth(ctx.db(), windowMinutes)
    const alerts = notificationHealthAlerts(metrics, limits)
    if (options.check && alerts.length) process.exitCode = 1
    return { windowMinutes, metrics, alerts }
  },
  render(ctx, result) {
    ctx.ui.section(
      `Notification health (${result.windowMinutes}-minute outcomes window)`,
    )
    ctx.ui.kv(result.metrics)
    if (result.alerts.length)
      result.alerts.forEach((alert) => ctx.ui.warn(alert))
    else
      ctx.ui.success('No queue/scheduler alerts at the configured thresholds.')
  },
})

const providerHealth = defineAction<{
  metrics: ProviderHealth
  alerts: string[]
}>({
  name: 'notification-provider-health',
  title: 'Inspect shared voice provider capacity',
  description:
    'Read-only global admission limits, request slots and throttle counts. --check exits 1 for expired capacity slots.',
  mutates: false,
  options: [
    {
      flags: '--check',
      description: 'Exit 1 when expired provider slots remain',
    },
  ],
  examples: [
    'ops notification-provider-health --env qa --json',
    'ops notification-provider-health --env prod --check --json',
  ],
  async run(ctx, options) {
    const metrics = await getProviderHealth(ctx.db())
    const alerts = metrics.expired_slots > 0 ? ['expired_provider_slots'] : []
    if (options.check && alerts.length) process.exitCode = 1
    return { metrics, alerts }
  },
  render(ctx, result) {
    ctx.ui.section('Shared voice provider admission capacity')
    ctx.ui.kv(result.metrics)
    result.alerts.forEach((alert) => ctx.ui.warn(alert))
    if (!result.alerts.length) ctx.ui.success('No expired provider slots.')
  },
})

const audit = defineAction<AuditRow[]>({
  name: 'audit',
  title: 'View the admin audit log',
  description:
    'Who changed what, newest first. Filter by user, action prefix (e.g. "premium."), operator, or date.',
  mutates: false,
  options: [
    { flags: '--user <query>', description: 'Only changes to this user' },
    {
      flags: '--action <prefix>',
      description: 'Action prefix, e.g. premium. or quota.topup',
    },
    { flags: '--by <operator>', description: 'Only changes by this operator' },
    {
      flags: '--since <date>',
      description: 'Only changes on/after YYYY-MM-DD',
    },
    LIMIT_OPTION,
  ],
  examples: [
    'ops audit --user priya@example.com',
    'ops audit --action premium. --since 2026-10-01 --json',
  ],
  async run(ctx, options) {
    let userId: string | undefined
    if (
      options.user ||
      (ctx.flags.interactive &&
        (await ctx.prompt.confirm('Filter by user?', false)))
    ) {
      userId = (await selectUser(ctx, options.user)).userId
    }
    const since = options.since
      ? parseDate(String(options.since), '--since')
      : undefined
    return listAudit(ctx.db(), {
      userId,
      action: options.action ? String(options.action) : undefined,
      operator: options.by ? String(options.by) : undefined,
      // parseDate returns end of day; --since means from the start of that day.
      since: since
        ? new Date(Date.parse(since) - 86_400_000 + 1).toISOString()
        : undefined,
      limit: parseInteger(String(options.limit ?? 20), '--limit', {
        min: 1,
        max: 1000,
      }),
    })
  },
  render(ctx, rows) {
    ctx.ui.table(
      rows.map((row) => ({
        at: formatDateTime(row.created_at),
        operator: row.operator,
        action: row.action,
        user: row.target_user_id,
        target: row.target_type
          ? `${row.target_type}:${row.target_id ?? ''}`
          : '',
        reason: row.reason,
      })),
      'No audit entries.',
    )
  },
})

interface BulkResultRow {
  line: number
  email: string
  action: string
  amount: string
  reason: string
  status: 'ok' | 'failed'
  detail: string
}

interface BulkOutcome {
  total: number
  succeeded: number
  failed: number
  failedFile: string | null
  results: BulkResultRow[]
}

function failedFilePath(input: string) {
  const extension = extname(input)
  return join(dirname(input), `${basename(input, extension)}.failed.csv`)
}

async function resolveEmails(ctx: OpsContext, rows: BulkRow[]) {
  const emails = [...new Set(rows.map((row) => row.email))]
  const resolved = new Map<string, string | Error>()
  for (const email of emails) {
    try {
      const matches = (await searchUsers(ctx.db(), email)).filter(
        (match) => match.email?.toLowerCase() === email,
      )
      resolved.set(
        email,
        matches.length === 1
          ? matches[0].userId
          : new Error(
              matches.length
                ? 'Email matches several users'
                : 'No user with this email',
            ),
      )
    } catch (error) {
      resolved.set(email, toOpsError(error))
    }
  }
  return resolved
}

const bulk = defineAction<BulkOutcome>({
  name: 'bulk',
  title: 'Apply grants from a CSV file',
  description: `Columns: ${BULK_COLUMNS.join(',')}. Actions: ${BULK_ACTIONS.map((action) => `${action} (amount: ${BULK_AMOUNT[action]})`).join('; ')}. Previews every row, asks once, then writes a .failed.csv with any rows to fix and re-run.`,
  mutates: true,
  options: [{ flags: '--file <path>', description: 'CSV file' }],
  examples: [
    'ops bulk --file grants.csv --reason "Diwali promo"',
    'ops bulk --file grants.csv --dry-run',
  ],
  async run(ctx, options) {
    const file = await askValue(ctx, options.file, {
      flag: '--file',
      message: 'CSV file path',
      parse: (value) => {
        const path = resolve(value.trim().replace(/^"|"$/g, ''))
        if (!existsSync(path)) throw new UsageError(`File not found: ${path}`)
        return path
      },
    })
    const { rows, errors } = parseBulkCsv(readFileSync(file, 'utf8'))
    if (rows.length === 0 && errors.length === 0)
      throw new UsageError('The CSV has no data rows.')

    const userIds = await ctx.ui.spin(`Looking up ${rows.length} row(s)`, () =>
      resolveEmails(ctx, rows),
    )
    const results: BulkResultRow[] = errors.map((error) => ({
      line: error.line,
      email: error.raw.email ?? '',
      action: error.raw.action ?? '',
      amount: error.raw.amount ?? '',
      reason: error.raw.reason ?? '',
      status: 'failed',
      detail: error.error,
    }))
    const runnable: { row: BulkRow; userId: string }[] = []
    for (const row of rows) {
      const userId = userIds.get(row.email)
      if (typeof userId === 'string') {
        runnable.push({ row, userId })
      } else {
        results.push({
          ...rowFields(row),
          status: 'failed',
          detail: userId?.message ?? 'Lookup failed',
        })
      }
    }

    ctx.ui.section('Rows')
    ctx.ui.table(
      [
        ...runnable.map(({ row }) => ({
          line: row.line,
          email: row.email,
          action: row.action,
          amount: row.amount ?? 'default',
          check: 'ready',
        })),
        ...results.map((result) => ({
          line: result.line,
          email: result.email,
          action: result.action,
          amount: result.amount,
          check: `skip: ${result.detail}`,
        })),
      ].sort((a, b) => a.line - b.line),
    )
    if (runnable.length === 0) {
      throw new UsageError('No row can be applied; fix the CSV and try again.')
    }

    const counts = new Map<string, number>()
    for (const { row } of runnable)
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1)
    await confirmMutation(ctx, {
      title: `Apply ${runnable.length} row(s) from ${basename(file)}`,
      destructive: runnable.some(({ row }) =>
        isDestructiveBulkAction(row.action),
      ),
      notes: results.length
        ? [
            `${results.length} invalid row(s) will be skipped and written to the failed file.`,
          ]
        : [],
      changes: [...counts].map(([action, total]) => ({
        field: action,
        before: '',
        after: `${total} user(s)`,
      })),
    })

    for (const [index, { row, userId }] of runnable.entries()) {
      try {
        const detail = await ctx.ui.spin(
          `[${index + 1}/${runnable.length}] ${row.action} · ${row.email}`,
          () =>
            executeBulkRow(ctx.db(), row, userId, {
              operator: ctx.operator,
              reason: ctx.flags.reason,
            }),
        )
        results.push({ ...rowFields(row), status: 'ok', detail })
      } catch (error) {
        results.push({
          ...rowFields(row),
          status: 'failed',
          detail: toOpsError(error).message,
        })
      }
    }
    results.sort((a, b) => a.line - b.line)

    const failedRows = results.filter((result) => result.status === 'failed')
    let failedFile: string | null = null
    if (failedRows.length > 0) {
      failedFile = failedFilePath(file)
      writeFileSync(
        failedFile,
        toCsv(
          failedRows.map((result) => ({ ...result, error: result.detail })),
          [...BULK_COLUMNS, 'error'],
        ),
      )
      process.exitCode = 1
    }
    return {
      total: results.length,
      succeeded: results.length - failedRows.length,
      failed: failedRows.length,
      failedFile,
      results,
    }
  },
  render(ctx, outcome) {
    ctx.ui.table(
      outcome.results.map((result) => ({
        line: result.line,
        email: result.email,
        action: result.action,
        status: result.status,
        detail: result.detail,
      })),
    )
    if (outcome.failed === 0) {
      ctx.ui.success(`All ${outcome.succeeded} row(s) applied.`)
    } else {
      ctx.ui.warn(
        `${outcome.succeeded} applied, ${outcome.failed} failed. Fix and re-run: ${outcome.failedFile}`,
      )
    }
  },
})

function rowFields(row: BulkRow) {
  return {
    line: row.line,
    email: row.email,
    action: row.action,
    amount: row.amount === null ? '' : String(row.amount),
    reason: row.reason ?? '',
  }
}

const allowlistAdd = defineAction<{ projectRef: string; file: string }>({
  name: 'allowlist-add',
  title: 'Mark a Supabase project as a dev project (this machine)',
  description: `Adds a project ref to ${LOCAL_ALLOWLIST} (git-ignored) so writes to it are not treated as production. Never add the production project.`,
  mutates: false,
  options: [
    {
      flags: '--ref <project_ref>',
      description: 'Project ref (default: the current --env project)',
    },
  ],
  examples: [
    'ops allowlist-add --env qa',
    'ops allowlist-add --ref abcdefghijklmnopqrst',
  ],
  async run(ctx, options) {
    if (ctx.envName === 'prod')
      throw new UsageError('Refusing to allowlist with --env prod.')
    const projectRef = await askValue(
      ctx,
      options.ref ??
        projectRefFromUrl(ctx.env.values.NEXT_PUBLIC_SUPABASE_URL) ??
        undefined,
      {
        flag: '--ref',
        message: 'Project ref',
        parse: (value) => {
          const ref = value.trim()
          if (!/^[a-z0-9]{20}$/.test(ref))
            throw new UsageError(
              `"${value}" is not a Supabase project ref (20 lowercase letters/digits).`,
            )
          return ref
        },
      },
    )
    if (!ctx.target.isProduction && ctx.target.projectRef === projectRef) {
      ctx.ui.info(
        `${projectRef} is already treated as a dev project (${ctx.target.reason}).`,
      )
      return { projectRef, file: LOCAL_ALLOWLIST }
    }
    ctx.ui.warn(
      `Writes to ${projectRef} will no longer require typing the project ref. Only do this for dev/QA projects.`,
    )
    if (!ctx.flags.yes) {
      if (!ctx.flags.interactive) throw new UsageError('Pass --yes to confirm.')
      if (
        !(await ctx.prompt.confirm(
          `Allowlist ${projectRef} as a dev project?`,
          false,
        ))
      )
        throw new AbortedError()
    }
    addLocalAllowlistRef(projectRef)
    return { projectRef, file: LOCAL_ALLOWLIST }
  },
  render(ctx, outcome) {
    ctx.ui.success(`${outcome.projectRef} is allowlisted in ${outcome.file}.`)
  },
})

export const opsGroup: GroupDef = {
  name: 'ops',
  title: 'Ops: doctor, stats, audit log, bulk grants',
  description: 'Health checks, reporting, and batch operations.',
  actions: [
    doctor,
    incident,
    stats,
    notificationHealth,
    providerHealth,
    audit,
    bulk,
    allowlistAdd,
    ...feedbackActions,
  ],
}
