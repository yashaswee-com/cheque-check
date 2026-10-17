import { defineAction, type GroupDef, type OptionDef } from '../lib/action'
import type { OpsContext, SelectedUser } from '../lib/context'
import { AbortedError, UsageError } from '../lib/errors'
import { addDays, formatDateTime } from '../lib/format'
import { confirmMutation } from '../lib/guards'
import { parseDate, parseInteger } from '../lib/validators'
import {
  getEntitlement,
  getProduct,
  getQuota,
  grantSubscription,
  hasAccess,
  METERED,
  METERED_KINDS,
  quotaRemaining,
  quotaUsable,
  setQuota,
  topupQuota,
  type MeteredFeature,
  type MeteredKind,
  type QuotaChangeResult,
  type SubscriptionGrantResult,
} from '../domain/monetization'
import { entitlementSummary, expiryLabel, quotaSummary } from './render'
import { askChoice, askValue, selectUser, USER_OPTION } from './shared'

const KIND_OPTION: OptionDef = {
  flags: '--kind <kind>',
  description: 'voice (Voice Reminders) or ai (AI Scans)',
  choices: METERED_KINDS,
}
const NO_TRANSACTION_OPTION: OptionDef = {
  flags: '--no-transaction',
  description: 'Do not record a ₹0 admin transaction in the purchase history',
}

async function askKind(
  ctx: OpsContext,
  value: unknown,
): Promise<MeteredFeature> {
  const kind = await askChoice<MeteredKind>(ctx, value, {
    flag: '--kind',
    message: 'Which quota?',
    choices: METERED_KINDS.map((key) => ({
      value: key,
      name: METERED[key].label,
    })),
  })
  return METERED[kind]
}

export type SubscriptionOutcome = { userId: string } & SubscriptionGrantResult
export type TopupOutcome =
  | ({ kind: 'topup'; userId: string } & QuotaChangeResult)
  | ({ kind: 'subscription'; userId: string } & SubscriptionGrantResult)

/** Preview → confirm → admin_grant_subscription. Shared with topup's "grant the subscription instead". */
export async function grantSubscriptionFlow(
  ctx: OpsContext,
  args: {
    user: SelectedUser
    feature: MeteredFeature
    days: number
    quota: number
    recordTransaction: boolean
  },
): Promise<SubscriptionOutcome> {
  const db = ctx.db()
  const [entitlement, quota] = await Promise.all([
    getEntitlement(db, args.user.userId, args.feature.subFeature),
    getQuota(db, args.user.userId, args.feature.quotaFeature),
  ])
  const now = Date.now()
  const base =
    entitlement?.status === 'active' &&
    entitlement.valid_until &&
    Date.parse(entitlement.valid_until) > now
      ? Date.parse(entitlement.valid_until)
      : now
  const newExpiry = addDays(args.days, new Date(base)).toISOString()
  const carried = quotaUsable(quota, now) ? quotaRemaining(quota) : 0
  const notes = [
    base > now
      ? 'The subscription is active, so the new period is added on top of the current expiry.'
      : 'The new period starts now.',
    carried > 0
      ? `${carried} unused ${args.feature.label} carry over into the new pool.`
      : 'No unused quota carries over.',
  ]
  if (args.recordTransaction)
    notes.push('A ₹0 admin transaction will appear in the purchase history.')

  await confirmMutation(ctx, {
    title: `Grant ${args.feature.label} subscription (${args.days} days, ${args.quota} included) · ${args.user.label}`,
    notes,
    changes: [
      {
        field: args.feature.subFeature,
        before: entitlementSummary(entitlement),
        after: `active, until ${formatDateTime(newExpiry)}`,
      },
      {
        field: `${args.feature.quotaFeature} limit`,
        before: quota?.limit ?? 'none',
        after: carried + args.quota,
      },
      {
        field: `${args.feature.quotaFeature} used`,
        before: quota?.used ?? 'none',
        after: 0,
      },
      {
        field: 'quota resets',
        before: quota ? expiryLabel(quota.reset_at) : 'none',
        after: expiryLabel(newExpiry),
      },
    ],
  })
  const result = await ctx.ui.spin('Granting subscription', () =>
    grantSubscription(db, {
      userId: args.user.userId,
      featureId: args.feature.subFeature,
      days: args.days,
      quota: args.quota,
      operator: ctx.operator,
      reason: ctx.flags.reason,
      recordTransaction: args.recordTransaction,
    }),
  )
  return { userId: args.user.userId, ...result }
}

function renderSubscription(ctx: OpsContext, outcome: SubscriptionGrantResult) {
  ctx.ui.success(
    `${outcome.entitlement.feature_id} active until ${formatDateTime(outcome.entitlement.valid_until)}; ${outcome.quota.feature_id} ${quotaSummary(outcome.quota)}.`,
  )
}

const topup = defineAction<TopupOutcome>({
  name: 'topup',
  title: 'Top up Voice Reminders or AI Scans',
  description:
    "Adds calls/scans to the user's quota limit (used count is untouched). Warns when the pool has expired, because an expired pool cannot be consumed, and offers to grant the subscription instead.",
  mutates: true,
  options: [
    USER_OPTION,
    KIND_OPTION,
    {
      flags: '--amount <n>',
      description: 'How many to add (default: the top-up pack size)',
    },
    NO_TRANSACTION_OPTION,
  ],
  examples: [
    'quota topup --user priya@example.com --kind voice',
    'quota topup --user priya@example.com --kind ai --amount 50 --reason "Scan failures on 12 Oct"',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const feature = await askKind(ctx, options.kind)
    const db = ctx.db()
    const [pack, quota, subscription] = await Promise.all([
      getProduct(db, feature.topupProduct),
      getQuota(db, user.userId, feature.quotaFeature),
      getEntitlement(db, user.userId, feature.subFeature),
    ])
    const packSize = pack.quota_increment ?? 1

    let amount: number
    if (options.amount !== undefined) {
      amount = parseInteger(String(options.amount), '--amount', {
        min: 1,
        max: 100_000,
      })
    } else if (!ctx.flags.interactive) {
      amount = packSize
    } else {
      const choice = await ctx.prompt.select({
        message: 'How many?',
        choices: [
          {
            value: 'pack',
            name: `${packSize} (same as the ${pack.name} pack)`,
          },
          { value: 'custom', name: 'Custom amount' },
        ],
      })
      amount =
        choice === 'pack'
          ? packSize
          : await askValue(ctx, undefined, {
              flag: '--amount',
              message: 'Amount to add',
              parse: (value) =>
                parseInteger(value, 'Amount', { min: 1, max: 100_000 }),
            })
    }

    const recordTransaction = options.transaction !== false
    const notes: string[] = []
    if (quota && !quotaUsable(quota)) {
      ctx.ui.warn(
        `The ${feature.label} pool expired on ${formatDateTime(quota.reset_at)}; a top-up alone cannot be used.`,
      )
      if (!ctx.flags.interactive) {
        throw new UsageError(
          'Refusing a top-up the user cannot use.',
          `Grant the subscription instead: quota sub --user ${user.userId} --kind ${feature.kind}`,
        )
      }
      const sub = await getProduct(db, feature.subProduct)
      const next = await ctx.prompt.select({
        message: 'What would you like to do?',
        choices: [
          {
            value: 'sub',
            name: `Grant the ${sub.entitlement_days ?? 30}-day subscription (${sub.quota_increment ?? 0} included + ${amount} extra)`,
          },
          { value: 'cancel', name: 'Cancel' },
        ],
      })
      if (next === 'cancel') throw new AbortedError()
      const outcome = await grantSubscriptionFlow(ctx, {
        user,
        feature,
        days: sub.entitlement_days ?? 30,
        quota: (sub.quota_increment ?? 0) + amount,
        recordTransaction,
      })
      return { kind: 'subscription', ...outcome }
    }
    if (!hasAccess(subscription)) {
      notes.push(
        `The user has no active ${feature.subFeature}. The top-up is usable, but the app only sells top-ups to subscribers.`,
      )
    }
    if (recordTransaction)
      notes.push('A ₹0 admin transaction will appear in the purchase history.')

    await confirmMutation(ctx, {
      title: `Add ${amount} ${feature.label} · ${user.label}`,
      notes,
      changes: [
        {
          field: `${feature.quotaFeature} limit`,
          before: quota?.limit ?? 'none',
          after: (quota?.limit ?? 0) + amount,
        },
        {
          field: `${feature.quotaFeature} used`,
          before: quota?.used ?? 'none',
          after: quota?.used ?? 0,
        },
        {
          field: 'remaining',
          before: quotaRemaining(quota),
          after: quotaRemaining(quota) + amount,
        },
      ],
    })
    const result = await ctx.ui.spin('Topping up', () =>
      topupQuota(db, {
        userId: user.userId,
        featureId: feature.quotaFeature,
        amount,
        operator: ctx.operator,
        reason: ctx.flags.reason,
        recordTransaction,
      }),
    )
    return { kind: 'topup', userId: user.userId, ...result }
  },
  render(ctx, outcome) {
    if (outcome.kind === 'subscription') renderSubscription(ctx, outcome)
    else
      ctx.ui.success(
        `${outcome.after.feature_id}: ${quotaSummary(outcome.after)}.`,
      )
  },
})

const sub = defineAction<SubscriptionOutcome>({
  name: 'sub',
  title: 'Grant or extend a subscription',
  description:
    'Grants/extends the Voice Reminder or AI Scanner subscription and refreshes its quota pool, the same way a purchase does (extends from the current expiry; unused quota carries over).',
  mutates: true,
  options: [
    USER_OPTION,
    KIND_OPTION,
    {
      flags: '--days <n>',
      description: 'Subscription length (default: catalog, 30)',
    },
    {
      flags: '--quota <n>',
      description: 'Included calls/scans (default: catalog)',
    },
    NO_TRANSACTION_OPTION,
  ],
  examples: [
    'quota sub --user priya@example.com --kind voice',
    'quota sub --user <uuid> --kind ai --days 60 --quota 500',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const feature = await askKind(ctx, options.kind)
    const product = await getProduct(ctx.db(), feature.subProduct)
    const days = await askValue(
      ctx,
      options.days ??
        (ctx.flags.interactive ? undefined : (product.entitlement_days ?? 30)),
      {
        flag: '--days',
        message: 'Days',
        default: String(product.entitlement_days ?? 30),
        parse: (value) => parseInteger(value, 'Days', { min: 1, max: 3650 }),
      },
    )
    const quota = await askValue(
      ctx,
      options.quota ??
        (ctx.flags.interactive ? undefined : (product.quota_increment ?? 0)),
      {
        flag: '--quota',
        message: `Included ${feature.label}`,
        default: String(product.quota_increment ?? 0),
        parse: (value) =>
          parseInteger(value, 'Quota', { min: 0, max: 100_000 }),
      },
    )
    return grantSubscriptionFlow(ctx, {
      user,
      feature,
      days,
      quota,
      recordTransaction: options.transaction !== false,
    })
  },
  render: renderSubscription,
})

const set = defineAction<{ userId: string } & QuotaChangeResult>({
  name: 'set',
  title: 'Set quota numbers exactly (advanced)',
  description:
    'Overwrites limit, used and reset date. Use for corrections; prefer topup/sub for grants.',
  mutates: true,
  options: [
    USER_OPTION,
    KIND_OPTION,
    { flags: '--limit <n>', description: 'New limit' },
    { flags: '--used <n>', description: 'New used count (default: keep)' },
    {
      flags: '--reset-at <date|never|keep>',
      description: 'New reset date (default: keep)',
    },
  ],
  examples: [
    'quota set --user priya@example.com --kind voice --limit 100 --used 0',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const feature = await askKind(ctx, options.kind)
    const before = await getQuota(ctx.db(), user.userId, feature.quotaFeature)
    const limit = await askValue(ctx, options.limit, {
      flag: '--limit',
      message: 'Limit',
      default: before ? String(before.limit) : undefined,
      parse: (value) =>
        parseInteger(value, 'Limit', { min: 0, max: 1_000_000 }),
    })
    const used = await askValue(
      ctx,
      options.used ?? (ctx.flags.interactive ? undefined : (before?.used ?? 0)),
      {
        flag: '--used',
        message: 'Used',
        default: String(before?.used ?? 0),
        parse: (value) =>
          parseInteger(value, 'Used', { min: 0, max: 1_000_000 }),
      },
    )
    const resetAt = await askValue(
      ctx,
      options.resetAt ?? (ctx.flags.interactive ? undefined : 'keep'),
      {
        flag: '--reset-at',
        message: 'Reset date (YYYY-MM-DD, "never", or "keep")',
        default: 'keep',
        parse: (value) => {
          const normalised = value.trim().toLowerCase()
          if (normalised === 'keep') return before?.reset_at ?? null
          if (normalised === 'never') return null
          return parseDate(value, 'Reset date')
        },
      },
    )
    await confirmMutation(ctx, {
      title: `Set ${feature.quotaFeature} quota · ${user.label}`,
      destructive: true,
      changes: [
        { field: 'limit', before: before?.limit ?? 'none', after: limit },
        { field: 'used', before: before?.used ?? 'none', after: used },
        {
          field: 'resets',
          before: before ? expiryLabel(before.reset_at) : 'none',
          after: expiryLabel(resetAt),
        },
      ],
      notes:
        resetAt && Date.parse(resetAt) <= Date.now()
          ? ['The reset date is in the past: the pool will be unusable.']
          : [],
    })
    const result = await setQuota(ctx.db(), {
      userId: user.userId,
      featureId: feature.quotaFeature,
      limit,
      used,
      resetAt,
      operator: ctx.operator,
      reason: ctx.flags.reason,
    })
    return { userId: user.userId, ...result }
  },
  render(ctx, outcome) {
    ctx.ui.success(
      `${outcome.after.feature_id}: ${quotaSummary(outcome.after)}.`,
    )
  },
})

export const quotaGroup: GroupDef = {
  name: 'quota',
  title: 'Quotas: top up, subscriptions, corrections',
  description: 'Voice Reminder and AI Scan quotas and their subscriptions.',
  actions: [topup, sub, set],
}
