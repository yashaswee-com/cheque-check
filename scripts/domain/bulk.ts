import { FEATURE_IDS } from '../../src/features/monetization/constants'
import { addDays } from '../lib/format'
import { parseCsv } from '../lib/csv'
import { UsageError } from '../lib/errors'
import { isEmail } from '../lib/validators'
import type { AdminClient } from '../lib/supabase'
import {
  getEntitlement,
  getProduct,
  grantSubscription,
  METERED,
  setEntitlement,
  topupQuota,
  type MeteredKind,
} from './monetization'

export const BULK_ACTIONS = [
  'lifetime',
  'trial',
  'topup-voice',
  'topup-ai',
  'sub-voice',
  'sub-ai',
  'cancel-premium',
] as const
export type BulkActionName = (typeof BULK_ACTIONS)[number]

export const BULK_COLUMNS = ['email', 'action', 'amount', 'reason'] as const

/** What `amount` means per action, and its default when blank. */
export const BULK_AMOUNT: Record<BulkActionName, string> = {
  lifetime: 'ignored',
  trial: 'days (default 14)',
  'topup-voice': 'calls to add (default: pack size)',
  'topup-ai': 'scans to add (default: pack size)',
  'sub-voice': 'days (default: catalog)',
  'sub-ai': 'days (default: catalog)',
  'cancel-premium': 'ignored',
}

export interface BulkRow {
  line: number
  email: string
  action: BulkActionName
  amount: number | null
  reason: string | null
}

export interface BulkRowError {
  line: number
  raw: Record<string, string>
  error: string
}

export function parseBulkCsv(text: string): {
  rows: BulkRow[]
  errors: BulkRowError[]
} {
  const records = parseCsv(text)
  if (records.length > 0) {
    const missing = ['email', 'action'].filter(
      (column) => !(column in records[0]),
    )
    if (missing.length > 0) {
      throw new UsageError(
        `CSV is missing column(s): ${missing.join(', ')}.`,
        `Expected header: ${BULK_COLUMNS.join(',')}`,
      )
    }
  }
  const rows: BulkRow[] = []
  const errors: BulkRowError[] = []
  records.forEach((raw, index) => {
    // Line 1 is the header.
    const line = index + 2
    const email = (raw.email ?? '').trim().toLowerCase()
    const action = (raw.action ?? '').trim().toLowerCase()
    const amountText = (raw.amount ?? '').trim()
    const fail = (error: string) => errors.push({ line, raw, error })

    if (!isEmail(email)) return fail(`Invalid email "${raw.email ?? ''}"`)
    if (!(BULK_ACTIONS as readonly string[]).includes(action)) {
      return fail(
        `Unknown action "${raw.action ?? ''}" (use ${BULK_ACTIONS.join(', ')})`,
      )
    }
    let amount: number | null = null
    if (amountText) {
      if (
        !/^\d+$/.test(amountText) ||
        Number(amountText) < 1 ||
        Number(amountText) > 100_000
      ) {
        return fail(`Invalid amount "${amountText}" (whole number 1-100000)`)
      }
      amount = Number(amountText)
    }
    rows.push({
      line,
      email,
      action: action as BulkActionName,
      amount,
      reason: (raw.reason ?? '').trim() || null,
    })
  })
  return { rows, errors }
}

export function isDestructiveBulkAction(action: BulkActionName) {
  return action === 'cancel-premium'
}

const kindOf = (action: BulkActionName): MeteredKind =>
  action.endsWith('-ai') ? 'ai' : 'voice'

/** Applies one row through the same audited RPCs as the single-user commands. */
export async function executeBulkRow(
  db: AdminClient,
  row: BulkRow,
  userId: string,
  context: { operator: string; reason?: string; now?: Date },
): Promise<string> {
  const reason = row.reason ?? context.reason
  const base = { userId, operator: context.operator, reason }
  switch (row.action) {
    case 'lifetime': {
      const current = await getEntitlement(
        db,
        userId,
        FEATURE_IDS.LIFETIME_PREMIUM,
      )
      if (current?.status === 'active' && current.valid_until === null)
        return 'already lifetime'
      await setEntitlement(db, {
        ...base,
        featureId: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'active',
        validUntil: null,
        action: 'premium.grant_lifetime',
        recordTransaction: true,
      })
      return 'lifetime granted'
    }
    case 'trial': {
      const days = row.amount ?? 14
      await setEntitlement(db, {
        ...base,
        featureId: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'trialing',
        validUntil: addDays(days, context.now).toISOString(),
        action: 'premium.trial',
      })
      return `${days}-day trial`
    }
    case 'cancel-premium': {
      const current = await getEntitlement(
        db,
        userId,
        FEATURE_IDS.LIFETIME_PREMIUM,
      )
      if (!current || current.status === 'canceled') return 'nothing to cancel'
      await setEntitlement(db, {
        ...base,
        featureId: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'canceled',
        validUntil: current.valid_until,
        action: 'premium.cancel',
      })
      return 'premium canceled'
    }
    case 'topup-voice':
    case 'topup-ai': {
      const feature = METERED[kindOf(row.action)]
      const amount =
        row.amount ??
        (await getProduct(db, feature.topupProduct)).quota_increment ??
        1
      const result = await topupQuota(db, {
        ...base,
        featureId: feature.quotaFeature,
        amount,
        recordTransaction: true,
      })
      return `+${amount} ${feature.label} (limit ${result.after.limit})`
    }
    case 'sub-voice':
    case 'sub-ai': {
      const feature = METERED[kindOf(row.action)]
      const product = await getProduct(db, feature.subProduct)
      const days = row.amount ?? product.entitlement_days ?? 30
      const result = await grantSubscription(db, {
        ...base,
        featureId: feature.subFeature,
        days,
        quota: product.quota_increment ?? 0,
        recordTransaction: true,
      })
      return `${feature.subFeature} until ${result.entitlement.valid_until}`
    }
  }
}
