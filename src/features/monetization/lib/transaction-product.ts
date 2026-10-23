import { FEATURE_IDS, PRODUCT_IDS, type ProductId } from '../constants'
import type { Transaction } from '../repositories/monetization.repository'

/** Legacy fixtures/exports may predate product_id; only infer exact known pairs. */
export function transactionProductId(
  transaction: Pick<Transaction, 'product_id' | 'type' | 'feature_id'>,
): ProductId | null {
  if (transaction.product_id) {
    return Object.values(PRODUCT_IDS).includes(
      transaction.product_id as ProductId,
    )
      ? (transaction.product_id as ProductId)
      : null
  }
  const { type, feature_id: feature } = transaction
  if (type === 'lifetime' && feature === FEATURE_IDS.LIFETIME_PREMIUM)
    return PRODUCT_IDS.LIFETIME_PREMIUM
  if (type === 'subscription' && feature === FEATURE_IDS.AI_SCANNER_SUB)
    return PRODUCT_IDS.AI_SCANNER_30D
  if (type === 'subscription' && feature === FEATURE_IDS.VOICE_REMINDER_SUB)
    return PRODUCT_IDS.VOICE_REMINDER_30D
  if (type === 'top_up' && feature === FEATURE_IDS.AI_SCAN)
    return PRODUCT_IDS.AI_SCAN_250
  if (type === 'top_up' && feature === FEATURE_IDS.VOICE_REMINDER)
    return PRODUCT_IDS.VOICE_REMINDER_100
  return null
}
