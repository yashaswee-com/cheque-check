import { defineAction, type GroupDef } from '../lib/action'
import type { OpsContext } from '../lib/context'
import { OpsError, UsageError } from '../lib/errors'
import { formatDateTime, formatPaise } from '../lib/format'
import { confirmMutation } from '../lib/guards'
import { writeAudit } from '../lib/audit'
import { parseInteger } from '../lib/validators'
import { refundTransaction, type RefundResult } from '../domain/monetization'
import {
  findTransaction,
  fulfillOrder,
  isAdminGrant,
  listReservedPaymentCheckouts,
  listTransactions,
  countOrderPaymentAttempts,
  releasePaymentCheckout,
  verifyCapturedPayment,
  type VerifiedPayment,
} from '../domain/payments'
import type { TransactionRow } from '../domain/users'
import { entitlementSummary, quotaSummary, transactionTable } from './render'
import { askValue, LIMIT_OPTION, selectUser } from './shared'

const TRANSACTION_STATUSES = [
  'created',
  'authorized',
  'captured',
  'refunded',
  'failed',
] as const
const REF_OPTION = {
  flags: '--ref <reference>',
  description:
    'Transaction id, Razorpay order id (order_...), or payment id (pay_...)',
}

async function askTransaction(
  ctx: OpsContext,
  value: unknown,
): Promise<TransactionRow> {
  const reference = await askValue(ctx, value, {
    flag: '--ref',
    message: 'Transaction id, order_... or pay_...',
    parse: (input) => {
      const trimmed = input.trim()
      if (!trimmed) throw new UsageError('Enter a transaction reference.')
      return trimmed
    },
  })
  const transaction = await findTransaction(ctx.db(), reference)
  ctx.ui.kv({
    Transaction: transaction.id,
    User: transaction.user_id,
    Product: transaction.product_id,
    Amount: formatPaise(transaction.amount, transaction.currency),
    Status: transaction.status,
    Order: transaction.razorpay_order_id,
    Payment: transaction.razorpay_payment_id,
    Created: formatDateTime(transaction.created_at),
  })
  return transaction
}

const list = defineAction<TransactionRow[]>({
  name: 'list',
  title: 'List transactions',
  description: 'Recent transactions, optionally for one user or one status.',
  mutates: false,
  options: [
    {
      flags: '--user <query>',
      description: 'Only this user (email, phone, id, ...)',
    },
    {
      flags: '--status <status>',
      description: 'Only this status',
      choices: TRANSACTION_STATUSES,
    },
    LIMIT_OPTION,
  ],
  examples: [
    'payment list --status created',
    'payment list --user priya@example.com --json',
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
    return listTransactions(ctx.db(), {
      userId,
      status: options.status as TransactionRow['status'] | undefined,
      limit: parseInteger(String(options.limit ?? 20), '--limit', {
        min: 1,
        max: 1000,
      }),
    })
  },
  render(ctx, rows) {
    ctx.ui.table(transactionTable(rows), 'No transactions.')
  },
})

type ExpireCheckoutsResult = {
  expired: number
  unchanged: number
  providerOrdersRemainUsable: number
}

const expireCheckouts = defineAction<ExpireCheckoutsResult>({
  name: 'expire-checkouts',
  title: 'Force-expire active checkout reservations',
  description:
    'Destructive: expires every local reserved checkout, including unexpired ones. It does not cancel Razorpay orders; a later payment may need manual reconciliation.',
  mutates: true,
  options: [
    {
      flags: '--force-active',
      description:
        'Required: include reservations whose 30-minute window has not elapsed',
    },
  ],
  examples: [
    'payment expire-checkouts --env prod --force-active --reason "Reset checkout for payment testing"',
  ],
  async run(ctx, options) {
    if (options.forceActive !== true) {
      throw new UsageError(
        'Pass --force-active to confirm that unexpired reservations are included.',
      )
    }
    if (!ctx.flags.reason) {
      throw new UsageError(
        'A reason is required for checkout expiry.',
        'Pass --reason with the operator purpose.',
      )
    }

    const checkouts = await listReservedPaymentCheckouts(ctx.db())
    if (!checkouts.length)
      return { expired: 0, unchanged: 0, providerOrdersRemainUsable: 0 }

    const orders = checkouts.filter(
      (checkout): checkout is typeof checkout & { provider_order: string } =>
        Boolean(checkout.provider_order),
    )
    if (orders.length) {
      const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } =
        ctx.env.values
      if (!keyId || !keySecret) {
        throw new UsageError(
          'Razorpay credentials are required to check payment attempts before expiry.',
        )
      }
      for (const checkout of orders) {
        const attemptCount = await countOrderPaymentAttempts(
          { keyId, keySecret },
          checkout.provider_order,
        )
        if (attemptCount > 0) {
          throw new UsageError(
            'At least one reserved checkout has a Razorpay payment attempt; no checkout was expired.',
            'Review payment status in the Razorpay dashboard and reconcile any captured payment before retrying.',
          )
        }
      }
    }

    await confirmMutation(ctx, {
      title: 'Force-expire all reserved local payment checkouts',
      destructive: true,
      changes: [
        { field: 'reserved checkouts', before: checkouts.length, after: 0 },
        {
          field: 'Razorpay orders',
          before: orders.length,
          after: 'not canceled',
        },
      ],
      notes: [
        'This expires local reservations and marks linked created transactions failed.',
        'It does not cancel a Razorpay order. A later payment callback will be rejected and require operator reconciliation.',
        'The preflight found no Razorpay payment attempts for the listed orders.',
      ],
    })

    let expired = 0
    let unchanged = 0
    for (const checkout of checkouts) {
      try {
        const didExpire = await ctx.ui.spin('Expiring checkout', () =>
          releasePaymentCheckout(ctx.db(), checkout.id),
        )
        if (!didExpire) {
          unchanged += 1
          continue
        }
        await writeAudit(ctx, {
          action: 'payment.expire_checkout',
          targetUserId: checkout.user_id,
          targetType: 'payment_checkout',
          targetId: checkout.id,
          before: { status: 'reserved', expiresAt: checkout.expires_at },
          after: { status: 'expired' },
          metadata: {
            productId: checkout.product_id,
            providerOrderPresent: Boolean(checkout.provider_order),
            forced: true,
          },
        })
        expired += 1
      } catch (error) {
        throw new OpsError(
          `${expired} checkout(s) were expired before a later step failed.`,
          {
            hint: 'Check payment_checkouts and admin_audit_log before retrying; the Razorpay order is not canceled.',
            cause: error,
          },
        )
      }
    }
    return {
      expired,
      unchanged,
      providerOrdersRemainUsable: orders.length,
    }
  },
  render(ctx, result) {
    ctx.ui.kv({
      'Local checkouts expired': result.expired,
      'Changed before expiry': result.unchanged,
      'Razorpay orders not canceled': result.providerOrdersRemainUsable,
    })
    if (result.providerOrdersRemainUsable)
      ctx.ui.warn(
        'Existing Razorpay orders remain usable externally; a later payment may require reconciliation.',
      )
  },
})

type ReconciledPayment = Omit<VerifiedPayment, 'status'> & { verified: boolean }
type ReconcileOutcome =
  | { changed: false; reason: string; transaction: TransactionRow }
  | { changed: true; transaction: TransactionRow; payment: ReconciledPayment }

const reconcile = defineAction<ReconcileOutcome>({
  name: 'reconcile',
  title: 'Reconcile a paid-but-not-granted payment',
  description:
    'For "I paid but did not get Premium": confirms the payment is captured in Razorpay, then grants it through the same fulfil RPC the webhook uses (idempotent).',
  mutates: true,
  options: [
    REF_OPTION,
    {
      flags: '--skip-verify',
      description:
        'Do not ask Razorpay (requires --payment-id; use only when keys are unavailable)',
    },
    {
      flags: '--payment-id <pay_id>',
      description: 'Razorpay payment id, when skipping verification',
    },
  ],
  examples: [
    'payment reconcile --ref order_N1x2y3',
    'payment reconcile --ref order_N1x2y3 --skip-verify --payment-id pay_Q9w8 --reason "Seen captured in dashboard"',
  ],
  async run(ctx, options) {
    const transaction = await askTransaction(ctx, options.ref)
    if (isAdminGrant(transaction)) {
      throw new UsageError(
        'This is an admin grant, not a Razorpay payment; there is nothing to reconcile.',
      )
    }
    if (transaction.status === 'captured') {
      return {
        changed: false,
        reason: 'the payment is already captured and granted.',
        transaction,
      }
    }
    if (transaction.status !== 'created') {
      throw new UsageError(
        `Only "created" transactions can be reconciled (this one is ${transaction.status}).`,
      )
    }
    if (!transaction.razorpay_order_id) {
      throw new OpsError('The transaction has no Razorpay order id.')
    }

    let payment: ReconciledPayment
    const keyId = ctx.env.values.RAZORPAY_KEY_ID
    const keySecret = ctx.env.values.RAZORPAY_KEY_SECRET
    if (options.skipVerify) {
      const paymentId = await askValue(ctx, options.paymentId, {
        flag: '--payment-id',
        message: 'Razorpay payment id (pay_...)',
        parse: (input) => {
          const trimmed = input.trim()
          if (!/^pay_\w+$/.test(trimmed))
            throw new UsageError('Payment ids look like pay_XXXXXXXX.')
          return trimmed
        },
      })
      payment = {
        paymentId,
        amount: transaction.amount,
        currency: transaction.currency,
        method: null,
        verified: false,
      }
    } else {
      if (!keyId || !keySecret) {
        throw new UsageError(
          `RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set in ${ctx.env.file}, so the payment cannot be verified.`,
          'Add the keys, or check the Razorpay dashboard yourself and pass --skip-verify --payment-id pay_...',
        )
      }
      const verified = await ctx.ui.spin('Checking Razorpay', () =>
        verifyCapturedPayment(
          { keyId, keySecret },
          transaction.razorpay_order_id as string,
        ),
      )
      payment = { ...verified, verified: true }
    }

    const notes = payment.verified
      ? [
          `Razorpay shows ${payment.paymentId} captured${payment.method ? ` via ${payment.method}` : ''}.`,
        ]
      : [
          'NOT verified with Razorpay: you are vouching that this payment was captured.',
        ]
    if (
      payment.amount !== transaction.amount ||
      payment.currency !== transaction.currency
    ) {
      notes.push(
        `Captured ${formatPaise(payment.amount, payment.currency)} differs from the order's ${formatPaise(transaction.amount, transaction.currency)}; the RPC will reject a mismatch.`,
      )
    }
    await confirmMutation(ctx, {
      title: `Fulfil ${transaction.product_id} for user ${transaction.user_id}`,
      notes,
      changes: [
        { field: 'status', before: transaction.status, after: 'captured' },
        {
          field: 'payment id',
          before: transaction.razorpay_payment_id ?? 'none',
          after: payment.paymentId,
        },
        { field: 'grant', before: '', after: transaction.product_id },
      ],
    })
    const after = await ctx.ui.spin('Fulfilling', () =>
      fulfillOrder(ctx.db(), transaction, payment),
    )
    await writeAudit(ctx, {
      action: 'payment.reconcile',
      targetUserId: transaction.user_id,
      targetType: 'transaction',
      targetId: transaction.id,
      before: transaction,
      after,
      metadata: { verified: payment.verified, paymentId: payment.paymentId },
    })
    return { changed: true, transaction: after, payment }
  },
  render(ctx, outcome) {
    if (!outcome.changed) ctx.ui.info(`No change: ${outcome.reason}`)
    else
      ctx.ui.success(
        `Granted ${outcome.transaction.product_id}; transaction is now ${outcome.transaction.status}.`,
      )
  },
})

const refund = defineAction<RefundResult>({
  name: 'refund',
  title: 'Record a refund and revoke what it bought',
  description:
    'Marks a captured payment refunded and (by default) revokes what it granted, unless a newer purchase of the same feature exists. Database only: issue the money refund in the Razorpay dashboard.',
  mutates: true,
  options: [
    REF_OPTION,
    {
      flags: '--no-revoke',
      description: 'Only mark refunded; keep the entitlement/quota',
    },
  ],
  examples: [
    'payment refund --ref pay_Q9w8 --reason "Duplicate charge"',
    'payment refund --ref order_N1x2y3 --no-revoke',
  ],
  async run(ctx, options) {
    const transaction = await askTransaction(ctx, options.ref)
    if (isAdminGrant(transaction)) {
      throw new UsageError(
        'This is an admin grant, not a payment.',
        'Use `premium revoke` or `quota set` to take back an admin grant.',
      )
    }
    if (transaction.status !== 'captured') {
      throw new UsageError(
        `Only captured payments can be refunded (this one is ${transaction.status}).`,
      )
    }
    let revoke = options.revoke !== false
    if (revoke && ctx.flags.interactive && options.revoke === undefined) {
      revoke = await ctx.prompt.confirm(
        'Also revoke what this payment granted?',
        true,
      )
    }
    await confirmMutation(ctx, {
      title: `Refund ${formatPaise(transaction.amount, transaction.currency)} · ${transaction.product_id}`,
      destructive: true,
      notes: [
        'This does NOT move money. Issue the refund in the Razorpay dashboard as well.',
        revoke
          ? transaction.type === 'top_up'
            ? 'The top-up amount is removed from the quota limit (never below what is already used).'
            : 'The entitlement is canceled, unless a newer purchase of the same feature exists.'
          : 'The entitlement/quota is left as it is.',
      ],
      changes: [
        { field: 'status', before: transaction.status, after: 'refunded' },
        { field: 'revoke', before: '', after: revoke },
      ],
    })
    return ctx.ui.spin('Refunding', () =>
      refundTransaction(ctx.db(), {
        transactionId: transaction.id,
        operator: ctx.operator,
        reason: ctx.flags.reason,
        revoke,
      }),
    )
  },
  render(ctx, outcome) {
    ctx.ui.success(`Transaction ${outcome.transaction.id} marked refunded.`)
    if (outcome.revoke === 'skipped_newer_purchase') {
      ctx.ui.warn(
        'Access was kept: the user bought the same feature again later.',
      )
    }
    if (outcome.entitlement)
      ctx.ui.info(
        `${outcome.entitlement.feature_id}: ${entitlementSummary(outcome.entitlement)}`,
      )
    if (outcome.quota)
      ctx.ui.info(`${outcome.quota.feature_id}: ${quotaSummary(outcome.quota)}`)
    ctx.ui.warn('Remember to refund the money in the Razorpay dashboard.')
  },
})

export const paymentGroup: GroupDef = {
  name: 'payment',
  title: 'Payments: list, reconcile, refund, expire checkouts',
  description:
    'Inspect payment activity, reconcile captured payments, record refunds, and expire local checkout reservations.',
  actions: [list, expireCheckouts, reconcile, refund],
}
