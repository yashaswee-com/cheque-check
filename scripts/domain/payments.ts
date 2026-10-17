import Razorpay from 'razorpay'
import { TABLES } from '../../src/lib/supabase/tables'
import { NotFoundError, OpsError, unwrap, unwrapRows } from '../lib/errors'
import type { AdminClient } from '../lib/supabase'
import { isUuid } from '../lib/validators'
import type { TransactionRow } from './users'

export const ADMIN_ORDER_PREFIX = 'admin_'

export function isAdminGrant(
  transaction: Pick<TransactionRow, 'razorpay_order_id'>,
) {
  return Boolean(transaction.razorpay_order_id?.startsWith(ADMIN_ORDER_PREFIX))
}

export async function listTransactions(
  db: AdminClient,
  filters: {
    userId?: string
    status?: TransactionRow['status']
    limit: number
  },
): Promise<TransactionRow[]> {
  let query = db
    .from(TABLES.TRANSACTIONS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.status) query = query.eq('status', filters.status)
  return unwrapRows(await query, 'Listing transactions')
}

/** Looks a transaction up by its id, Razorpay order id, or Razorpay payment id. */
export async function findTransaction(
  db: AdminClient,
  reference: string,
): Promise<TransactionRow> {
  const value = reference.trim()
  const column = isUuid(value)
    ? 'id'
    : value.startsWith('pay_')
      ? 'razorpay_payment_id'
      : 'razorpay_order_id'
  const row = unwrap(
    await db
      .from(TABLES.TRANSACTIONS)
      .select('*')
      .eq(column, value)
      .maybeSingle(),
    'Loading transaction',
  )
  if (!row) {
    throw new NotFoundError(
      `No transaction matches ${value}.`,
      'Use the transaction id, Razorpay order id (order_...), or payment id (pay_...).',
    )
  }
  return row
}

export interface VerifiedPayment {
  paymentId: string
  amount: number
  currency: string
  status: string
  method: string | null
}

export interface RazorpayKeys {
  keyId: string
  keySecret: string
}

/** Finds the captured Razorpay payment for an order (the source of truth before fulfilling). */
export async function verifyCapturedPayment(
  keys: RazorpayKeys,
  orderId: string,
): Promise<VerifiedPayment> {
  const client = new Razorpay({
    key_id: keys.keyId,
    key_secret: keys.keySecret,
  })
  let items: Array<{
    id: string
    amount: number | string
    currency: string
    status: string
    method?: string
  }>
  try {
    const response = await client.orders.fetchPayments(orderId)
    items = response.items as typeof items
  } catch (error) {
    const description =
      (error as { error?: { description?: string } }).error?.description ??
      (error instanceof Error ? error.message : String(error))
    throw new OpsError(
      `Razorpay lookup for ${orderId} failed: ${description}`,
      {
        hint: 'Check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET belong to the same Razorpay mode (test/live) as the order.',
        cause: error,
      },
    )
  }

  const captured = items.find((payment) => payment.status === 'captured')
  if (!captured) {
    const statuses = items.map((payment) => `${payment.id}:${payment.status}`)
    throw new OpsError(`Razorpay has no captured payment for ${orderId}.`, {
      hint: statuses.length
        ? `Payments on this order: ${statuses.join(', ')}. Do not fulfil until Razorpay shows it captured.`
        : 'No payment attempts exist for this order.',
    })
  }
  return {
    paymentId: captured.id,
    amount: Number(captured.amount),
    currency: captured.currency,
    status: captured.status,
    method: captured.method ?? null,
  }
}

/** Grants what a captured payment paid for, through the same RPC the webhook uses. */
export async function fulfillOrder(
  db: AdminClient,
  transaction: TransactionRow,
  payment: { paymentId: string; amount: number; currency: string },
): Promise<TransactionRow> {
  if (!transaction.razorpay_order_id) {
    throw new OpsError('Transaction has no Razorpay order id to reconcile.')
  }
  const row = unwrap(
    await db.rpc('fulfill_payment_order', {
      razorpay_order: transaction.razorpay_order_id,
      razorpay_payment: payment.paymentId,
      order_user_id: transaction.user_id,
      requested_product_id: transaction.product_id,
      paid_amount: payment.amount,
      paid_currency: payment.currency,
    }),
    'Fulfilling payment order',
  )
  if (!row) throw new OpsError('fulfill_payment_order returned no transaction.')
  return row
}
