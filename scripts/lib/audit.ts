import type { Json } from '../../src/types/database.types'
import { TABLES } from '../../src/lib/supabase/tables'
import type { OpsContext } from './context'
import { OpsError } from './errors'

export interface AuditEntry {
  action: string
  targetUserId?: string | null
  targetType?: string
  targetId?: string
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

function toJson(value: unknown): Json | null {
  return value === undefined
    ? null
    : (JSON.parse(JSON.stringify(value)) as Json)
}

/**
 * Records a mutation made directly by the CLI (RPC-backed actions audit
 * themselves inside the same transaction). Called after the change, so a
 * failure here must say loudly that the change itself did go through.
 */
export async function writeAudit(
  ctx: OpsContext,
  entry: AuditEntry,
): Promise<string> {
  const { data, error } = await ctx
    .db()
    .from(TABLES.ADMIN_AUDIT_LOG)
    .insert({
      operator: ctx.operator,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      reason: ctx.flags.reason ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      metadata: (toJson({ env: ctx.envName, ...entry.metadata }) ?? {}) as Json,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new OpsError(
      `The change WAS applied, but writing the audit log failed: ${error?.message ?? 'no row returned'}.`,
      {
        hint: 'Record this change manually. If admin_audit_log is missing, apply the admin_ops migration.',
        cause: error,
      },
    )
  }
  return data.id
}
