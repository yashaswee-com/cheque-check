import {
  formatDateTime,
  formatPaise,
  formatRelative,
  shortId,
} from '../lib/format'
import type { Cell } from '../lib/ui'
import { hasAccess, quotaRemaining, quotaUsable } from '../domain/monetization'
import { isAdminGrant } from '../domain/payments'
import type {
  EntitlementRow,
  JobRow,
  QuotaRow,
  TransactionRow,
} from '../domain/users'

type Row = Record<string, Cell>

export function expiryLabel(validUntil: string | null | undefined): string {
  if (validUntil === null) return 'never'
  if (validUntil === undefined) return ''
  return `${formatDateTime(validUntil)} (${formatRelative(validUntil)})`
}

export function entitlementTable(
  rows: EntitlementRow[],
  now = Date.now(),
): Row[] {
  return rows.map((row) => ({
    feature: row.feature_id,
    status: row.status,
    access: hasAccess(row, now),
    expires: expiryLabel(row.valid_until),
    updated: formatDateTime(row.updated_at),
  }))
}

export function quotaTable(rows: QuotaRow[], now = Date.now()): Row[] {
  return rows.map((row) => ({
    feature: row.feature_id,
    used: row.used,
    limit: row.limit,
    remaining: quotaRemaining(row),
    resets: row.reset_at ? expiryLabel(row.reset_at) : 'never',
    usable: quotaUsable(row, now),
  }))
}

export function transactionTable(rows: TransactionRow[]): Row[] {
  return rows.map((row) => ({
    id: shortId(row.id),
    created: formatDateTime(row.created_at),
    product: row.product_id,
    amount: formatPaise(row.amount, row.currency),
    status: row.status,
    kind: isAdminGrant(row) ? 'admin grant' : 'payment',
    order: row.razorpay_order_id,
  }))
}

export function jobTable(rows: JobRow[]): Row[] {
  return rows.map((row) => ({
    id: row.id,
    created: formatDateTime(row.created_at),
    purpose: row.purpose,
    status: row.status,
    attempts: row.attempts,
    error: row.last_error,
  }))
}

/** Snapshot of the fields a quota/entitlement change touches, for previews. */
export function quotaSummary(row: QuotaRow | null): string {
  if (!row) return 'none'
  return `${row.used}/${row.limit} used${row.reset_at ? `, resets ${formatDateTime(row.reset_at)}` : ''}`
}

export function entitlementSummary(row: EntitlementRow | null): string {
  if (!row) return 'none'
  return `${row.status}, ${row.valid_until ? `until ${formatDateTime(row.valid_until)}` : 'no expiry'}`
}
