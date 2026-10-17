import { TABLES } from '../../src/lib/supabase/tables'
import type { Database } from '../../src/types/database.types'
import {
  FEATURE_IDS,
  PRODUCT_IDS,
  type ProductId,
} from '../../src/features/monetization/constants'
import { entitlementHasAccess } from '../../src/features/monetization/lib/premium-access'
import type { Entitlement } from '../../src/features/monetization/repositories/monetization.repository'
import { NotFoundError, unwrap } from '../lib/errors'
import type { AdminClient } from '../lib/supabase'
import type { EntitlementRow, QuotaRow, TransactionRow } from './users'

type Enums = Database['public']['Enums']
export type FeatureType = Enums['feature_type']
export type EntitlementStatusValue = Enums['entitlement_status']
export type ProductRow = Database['public']['Tables']['payment_products']['Row']

export type EntitlementFeature =
  | typeof FEATURE_IDS.LIFETIME_PREMIUM
  | typeof FEATURE_IDS.AI_SCANNER_SUB
  | typeof FEATURE_IDS.VOICE_REMINDER_SUB

export type MeteredKind = 'voice' | 'ai'

export interface MeteredFeature {
  kind: MeteredKind
  label: string
  quotaFeature: typeof FEATURE_IDS.VOICE_REMINDER | typeof FEATURE_IDS.AI_SCAN
  subFeature:
    typeof FEATURE_IDS.VOICE_REMINDER_SUB | typeof FEATURE_IDS.AI_SCANNER_SUB
  subProduct: ProductId
  topupProduct: ProductId
}

export const METERED: Record<MeteredKind, MeteredFeature> = {
  voice: {
    kind: 'voice',
    label: 'Voice Reminders',
    quotaFeature: FEATURE_IDS.VOICE_REMINDER,
    subFeature: FEATURE_IDS.VOICE_REMINDER_SUB,
    subProduct: PRODUCT_IDS.VOICE_REMINDER_30D,
    topupProduct: PRODUCT_IDS.VOICE_REMINDER_100,
  },
  ai: {
    kind: 'ai',
    label: 'AI Scans',
    quotaFeature: FEATURE_IDS.AI_SCAN,
    subFeature: FEATURE_IDS.AI_SCANNER_SUB,
    subProduct: PRODUCT_IDS.AI_SCANNER_30D,
    topupProduct: PRODUCT_IDS.AI_SCAN_250,
  },
}

export const METERED_KINDS = Object.keys(METERED) as MeteredKind[]

export async function getProduct(
  db: AdminClient,
  productId: ProductId,
): Promise<ProductRow> {
  const product = unwrap(
    await db
      .from(TABLES.PAYMENT_PRODUCTS)
      .select('*')
      .eq('id', productId)
      .maybeSingle(),
    'Loading payment product',
  )
  if (!product) {
    throw new NotFoundError(
      `Payment product ${productId} is missing from payment_products.`,
      'Apply all migrations to this project.',
    )
  }
  return product
}

export async function getEntitlement(
  db: AdminClient,
  userId: string,
  featureId: FeatureType,
): Promise<EntitlementRow | null> {
  return unwrap(
    await db
      .from(TABLES.USER_ENTITLEMENTS)
      .select('*')
      .eq('user_id', userId)
      .eq('feature_id', featureId)
      .maybeSingle(),
    'Loading entitlement',
  )
}

export async function getQuota(
  db: AdminClient,
  userId: string,
  featureId: FeatureType,
): Promise<QuotaRow | null> {
  return unwrap(
    await db
      .from(TABLES.USER_QUOTAS)
      .select('*')
      .eq('user_id', userId)
      .eq('feature_id', featureId)
      .maybeSingle(),
    'Loading quota',
  )
}

export function hasAccess(
  row: Pick<EntitlementRow, 'status' | 'valid_until'> | null,
  now = Date.now(),
) {
  // entitlementHasAccess only reads status and valid_until.
  return entitlementHasAccess(
    row ? ({ ...row } as Entitlement) : undefined,
    now,
  )
}

/** Quotas are only consumable before reset_at (see admin_increment_quota). */
export function quotaUsable(row: QuotaRow | null, now = Date.now()) {
  if (!row) return false
  return row.reset_at === null || Date.parse(row.reset_at) > now
}

export function quotaRemaining(row: QuotaRow | null) {
  return row ? Math.max(row.limit - row.used, 0) : 0
}

export interface EntitlementChangeResult {
  before: EntitlementRow | null
  after: EntitlementRow
  transaction_id: string | null
  audit_id: string
}

export async function setEntitlement(
  db: AdminClient,
  args: {
    userId: string
    featureId: EntitlementFeature
    status: EntitlementStatusValue
    validUntil: string | null
    operator: string
    action: string
    reason?: string
    recordTransaction?: boolean
  },
): Promise<EntitlementChangeResult> {
  const data = unwrap(
    await db.rpc('admin_set_entitlement', {
      p_user_id: args.userId,
      p_feature_id: args.featureId,
      p_status: args.status,
      p_valid_until: args.validUntil,
      p_operator: args.operator,
      p_action: args.action,
      p_reason: args.reason ?? null,
      p_record_transaction: args.recordTransaction ?? false,
    }),
    'Updating entitlement',
  )
  return data as unknown as EntitlementChangeResult
}

export interface SubscriptionGrantResult {
  entitlement: EntitlementRow
  quota: QuotaRow
  transaction_id: string | null
  audit_id: string
}

export async function grantSubscription(
  db: AdminClient,
  args: {
    userId: string
    featureId: MeteredFeature['subFeature']
    days: number
    quota: number
    operator: string
    reason?: string
    recordTransaction: boolean
  },
): Promise<SubscriptionGrantResult> {
  const data = unwrap(
    await db.rpc('admin_grant_subscription', {
      p_user_id: args.userId,
      p_feature_id: args.featureId,
      p_days: args.days,
      p_quota: args.quota,
      p_operator: args.operator,
      p_reason: args.reason ?? null,
      p_record_transaction: args.recordTransaction,
    }),
    'Granting subscription',
  )
  return data as unknown as SubscriptionGrantResult
}

export interface QuotaChangeResult {
  before: QuotaRow | null
  after: QuotaRow
  transaction_id?: string | null
  audit_id: string
}

export async function topupQuota(
  db: AdminClient,
  args: {
    userId: string
    featureId: MeteredFeature['quotaFeature']
    amount: number
    operator: string
    reason?: string
    recordTransaction: boolean
  },
): Promise<QuotaChangeResult> {
  const data = unwrap(
    await db.rpc('admin_topup_quota', {
      p_user_id: args.userId,
      p_feature_id: args.featureId,
      p_amount: args.amount,
      p_operator: args.operator,
      p_reason: args.reason ?? null,
      p_record_transaction: args.recordTransaction,
    }),
    'Topping up quota',
  )
  return data as unknown as QuotaChangeResult
}

export async function setQuota(
  db: AdminClient,
  args: {
    userId: string
    featureId: MeteredFeature['quotaFeature']
    limit: number
    used: number
    resetAt: string | null
    operator: string
    reason?: string
  },
): Promise<QuotaChangeResult> {
  const data = unwrap(
    await db.rpc('admin_set_quota', {
      p_user_id: args.userId,
      p_feature_id: args.featureId,
      p_limit: args.limit,
      p_used: args.used,
      p_reset_at: args.resetAt,
      p_operator: args.operator,
      p_reason: args.reason ?? null,
    }),
    'Setting quota',
  )
  return data as unknown as QuotaChangeResult
}

export interface RefundResult {
  transaction: TransactionRow
  revoke: 'revoked' | 'skipped_newer_purchase' | 'not_requested'
  entitlement: EntitlementRow | null
  quota: QuotaRow | null
  audit_id: string
}

export async function refundTransaction(
  db: AdminClient,
  args: {
    transactionId: string
    operator: string
    reason?: string
    revoke: boolean
  },
): Promise<RefundResult> {
  const data = unwrap(
    await db.rpc('admin_refund_transaction', {
      p_transaction_id: args.transactionId,
      p_operator: args.operator,
      p_reason: args.reason ?? null,
      p_revoke: args.revoke,
    }),
    'Refunding transaction',
  )
  return data as unknown as RefundResult
}
