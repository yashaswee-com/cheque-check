import { TABLES } from '../../src/lib/supabase/tables'
import type { Database } from '../../src/types/database.types'
import type { OpsContext } from '../lib/context'
import { toOpsError, unwrapRows } from '../lib/errors'
import { LOCAL_ALLOWLIST } from '../lib/project'
import type { FeedbackCursor } from '../../src/validators/feedback'
import {
  EDGE_FUNCTIONS,
  probeFunction,
  type AdminClient,
} from '../lib/supabase'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface DoctorCheck {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}

const MIGRATION_HINT =
  'Apply supabase/migrations/20261018000000_admin_ops.sql (npx supabase db push).'

function missing(ctx: OpsContext, keys: string[]) {
  return keys.filter((key) => !ctx.env.values[key])
}

/** Read-only health check of everything the ops CLI depends on. */
export async function runDoctor(
  ctx: OpsContext,
  fetchImpl: typeof fetch = fetch,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  const add = (check: DoctorCheck) => checks.push(check)

  add({
    name: 'Env file',
    status: ctx.env.fileExists ? 'ok' : 'warn',
    detail: ctx.env.fileExists
      ? ctx.env.file
      : `${ctx.env.file} not found (using process env only)`,
  })

  const missingCore = missing(ctx, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
  add({
    name: 'Supabase credentials',
    status: missingCore.length ? 'fail' : 'ok',
    detail: missingCore.length
      ? `missing ${missingCore.join(', ')}`
      : 'URL and service-role key set',
    hint: missingCore.length ? `Add them to ${ctx.env.file}.` : undefined,
  })
  const missingAnon = missing(ctx, ['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
  add({
    name: 'Anon key',
    status: missingAnon.length ? 'warn' : 'ok',
    detail: missingAnon.length
      ? 'missing (account magic-link will not work)'
      : 'set',
  })
  const missingRazorpay = missing(ctx, [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ])
  add({
    name: 'Razorpay keys',
    status: missingRazorpay.length ? 'warn' : 'ok',
    detail: missingRazorpay.length
      ? 'missing (payment reconcile needs --skip-verify)'
      : 'set (reconcile verifies with Razorpay)',
  })

  add({
    name: 'Target',
    status: ctx.target.isProduction && ctx.envName !== 'prod' ? 'warn' : 'ok',
    detail: `${ctx.target.projectRef ?? 'unknown'} · ${ctx.target.isProduction ? 'PRODUCTION' : 'non-production'} (${ctx.target.reason})`,
    hint:
      ctx.target.isProduction && ctx.envName !== 'prod' && ctx.target.projectRef
        ? `If this is a disposable dev project, run \`npm run ops -- ops allowlist-add --env ${ctx.envName}\` to add it to ${LOCAL_ALLOWLIST}.`
        : undefined,
  })
  add({ name: 'Operator', status: 'ok', detail: ctx.operator })

  if (missingCore.length) return checks

  const db = ctx.db()
  const connectivity = await db
    .from(TABLES.PROFILES)
    .select('id', { count: 'exact', head: true })
  add({
    name: 'Database',
    status: connectivity.error ? 'fail' : 'ok',
    detail: connectivity.error
      ? toOpsError(connectivity.error).message
      : `connected (${connectivity.count ?? 0} profiles)`,
    hint: connectivity.error ? toOpsError(connectivity.error).hint : undefined,
  })
  if (connectivity.error) return checks

  const audit = await db.from(TABLES.ADMIN_AUDIT_LOG).select('id').limit(1)
  // An empty operator makes the RPC fail its first check (22023) without
  // touching data, proving the function exists.
  const rpc = await db.rpc('admin_set_quota', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_feature_id: 'voice_reminder',
    p_limit: 0,
    p_used: 0,
    p_reset_at: null,
    p_operator: '',
  })
  const rpcInstalled = rpc.error?.code === '22023'
  add({
    name: 'Admin migration',
    status: !audit.error && rpcInstalled ? 'ok' : 'fail',
    detail:
      !audit.error && rpcInstalled
        ? 'admin_audit_log and admin RPCs present'
        : audit.error
          ? 'admin_audit_log missing'
          : `admin RPCs missing (${rpc.error?.message ?? 'unexpected success'})`,
    hint: !audit.error && rpcInstalled ? undefined : MIGRATION_HINT,
  })

  const credentials = ctx.credentials()
  for (const name of EDGE_FUNCTIONS) {
    const probe = await probeFunction(credentials, name, fetchImpl)
    add({
      name: `Function ${name}`,
      status: probe.deployed ? 'ok' : 'warn',
      detail:
        probe.status === null
          ? 'unreachable'
          : probe.deployed
            ? `deployed (GET → ${probe.status})`
            : 'not deployed (404)',
      hint: probe.deployed ? undefined : 'npm run supabase:functions:deploy',
    })
  }

  return checks
}

async function count(
  query: PromiseLike<{ count: number | null; error: unknown }>,
  label: string,
): Promise<number> {
  const { count: value, error } = await query
  if (error) throw toOpsError(error, label)
  return value ?? 0
}

export interface OpsStats {
  users: number
  businesses: number
  cheques: number
  lifetimeActive: number
  lifetimeTrialing: number
  voiceSubsActive: number
  aiSubsActive: number
  capturedPayments30d: number
  revenue30dPaise: number
  jobs24h: Record<string, number>
  audit7d: number
}

export type FeedbackOpsRow =
  Database['public']['Tables']['feedback_items']['Row']

export interface FeedbackOpsPage {
  items: FeedbackOpsRow[]
  nextCursor: FeedbackCursor | null
}

export async function listFeedback(
  db: AdminClient,
  options: {
    status?: FeedbackOpsRow['status']
    limit: number
    before?: FeedbackCursor
  },
): Promise<FeedbackOpsPage> {
  let query = db
    .from(TABLES.FEEDBACK_ITEMS)
    .select(
      'id,user_id,category,title,description,status,roadmap_published,vote_count,created_at,updated_at',
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit + 1)
  if (options.status) query = query.eq('status', options.status)
  if (options.before)
    query = query.or(
      `created_at.lt.${options.before.createdAt},and(created_at.eq.${options.before.createdAt},id.lt.${options.before.id})`,
    )
  const rows = unwrapRows(await query, 'Loading feedback items')
  const items = rows.slice(0, options.limit)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      rows.length > items.length && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
  }
}

export async function getFeedbackItem(
  db: AdminClient,
  id: string,
): Promise<FeedbackOpsRow> {
  const result = await db
    .from(TABLES.FEEDBACK_ITEMS)
    .select(
      'id,user_id,category,title,description,status,roadmap_published,vote_count,created_at,updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (result.error) throw toOpsError(result.error, 'Loading feedback item')
  if (!result.data) throw new Error(`Feedback item ${id} was not found.`)
  return result.data
}

export interface FeedbackUpdateResult {
  item: FeedbackOpsRow
  audit_id: string
}

export async function updateFeedback(
  db: AdminClient,
  input: {
    id: string
    status?: FeedbackOpsRow['status']
    published?: boolean
    operator: string
    reason?: string
  },
): Promise<FeedbackUpdateResult> {
  const { data, error } = await db.rpc('admin_update_feedback', {
    requested_id: input.id,
    requested_status: input.status ?? null,
    requested_published: input.published ?? null,
    requested_operator: input.operator,
    requested_reason: input.reason ?? null,
  })
  if (error) throw toOpsError(error, 'Updating feedback item')
  return data as unknown as FeedbackUpdateResult
}

export async function getStats(
  db: AdminClient,
  now = new Date(),
): Promise<OpsStats> {
  const since30d = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const since24h = new Date(now.getTime() - 86_400_000).toISOString()
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const head = { count: 'exact', head: true } as const
  const entitlementCount = (
    feature: Database['public']['Enums']['feature_type'],
    status: Database['public']['Enums']['entitlement_status'],
  ) =>
    count(
      db
        .from(TABLES.USER_ENTITLEMENTS)
        .select('id', head)
        .eq('feature_id', feature)
        .eq('status', status),
      'Counting entitlements',
    )

  const [
    users,
    businesses,
    cheques,
    lifetimeActive,
    lifetimeTrialing,
    voiceSubsActive,
    aiSubsActive,
    payments,
    jobs,
    audit7d,
  ] = await Promise.all([
    count(
      db.from(TABLES.PROFILES).select('id', head).is('deleted_at', null),
      'Counting users',
    ),
    count(
      db.from(TABLES.BUSINESSES).select('id', head).is('deleted_at', null),
      'Counting businesses',
    ),
    count(db.from(TABLES.CHEQUES).select('id', head), 'Counting cheques'),
    entitlementCount('lifetime_premium', 'active'),
    entitlementCount('lifetime_premium', 'trialing'),
    entitlementCount('voice_reminder_sub', 'active'),
    entitlementCount('ai_scanner_sub', 'active'),
    db
      .from(TABLES.TRANSACTIONS)
      .select('amount, razorpay_order_id')
      .eq('status', 'captured')
      .gte('created_at', since30d)
      .not('razorpay_order_id', 'like', 'admin\\_%'),
    db
      .from(TABLES.NOTIFICATION_JOBS)
      .select('status')
      .gte('created_at', since24h),
    count(
      db
        .from(TABLES.ADMIN_AUDIT_LOG)
        .select('id', head)
        .gte('created_at', since7d),
      'Counting audit entries',
    ),
  ])

  const paymentRows = unwrapRows(payments, 'Loading payments')
  const jobRows = unwrapRows(jobs, 'Loading jobs')
  const jobs24h: Record<string, number> = {}
  for (const job of jobRows)
    jobs24h[job.status] = (jobs24h[job.status] ?? 0) + 1

  return {
    users,
    businesses,
    cheques,
    lifetimeActive,
    lifetimeTrialing,
    voiceSubsActive,
    aiSubsActive,
    capturedPayments30d: paymentRows.length,
    revenue30dPaise: paymentRows.reduce((sum, row) => sum + row.amount, 0),
    jobs24h,
    audit7d,
  }
}

export type AuditRow = Database['public']['Tables']['admin_audit_log']['Row']

export async function listAudit(
  db: AdminClient,
  filters: {
    userId?: string
    action?: string
    operator?: string
    since?: string
    limit: number
  },
): Promise<AuditRow[]> {
  let query = db
    .from(TABLES.ADMIN_AUDIT_LOG)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit)
  if (filters.userId) query = query.eq('target_user_id', filters.userId)
  if (filters.action)
    query = query.like(
      'action',
      `${filters.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    )
  if (filters.operator) query = query.eq('operator', filters.operator)
  if (filters.since) query = query.gte('created_at', filters.since)
  return unwrapRows(await query, 'Loading audit log')
}
