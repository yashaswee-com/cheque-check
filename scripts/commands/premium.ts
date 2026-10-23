import { FEATURE_IDS } from '../../src/features/monetization/constants'
import {
  defineAction,
  type ActionDef,
  type GroupDef,
  type OptionDef,
} from '../lib/action'
import type { OpsContext, SelectedUser } from '../lib/context'
import { UsageError } from '../lib/errors'
import { addDays, formatDateTime } from '../lib/format'
import { confirmMutation } from '../lib/guards'
import { parseFutureDate, parseInteger } from '../lib/validators'
import {
  getEntitlement,
  hasAccess,
  setEntitlement,
  type EntitlementChangeResult,
  type EntitlementFeature,
  type EntitlementStatusValue,
} from '../domain/monetization'
import type { EntitlementRow } from '../domain/users'
import { entitlementSummary, expiryLabel } from './render'
import { askChoice, askValue, selectUser, USER_OPTION } from './shared'

export type EntitlementOutcome =
  | ({ changed: true; userId: string } & EntitlementChangeResult)
  | {
      changed: false
      userId: string
      reason: string
      current: EntitlementRow | null
    }

const FEATURE_CHOICES = [
  { value: FEATURE_IDS.LIFETIME_PREMIUM, name: 'Premium - Lifetime' },
  {
    value: FEATURE_IDS.VOICE_REMINDER_SUB,
    name: 'Voice Reminders - 30-Day Pack (100 calls)',
  },
  {
    value: FEATURE_IDS.AI_SCANNER_SUB,
    name: 'AI Scanner - 30-Day Pack (250 scans)',
  },
] as const satisfies { value: EntitlementFeature; name: string }[]

const FEATURE_OPTION: OptionDef = {
  flags: '--feature <feature>',
  description: 'Entitlement to change (default: lifetime_premium)',
  choices: FEATURE_CHOICES.map((choice) => choice.value),
}

const NO_TRANSACTION_OPTION: OptionDef = {
  flags: '--no-transaction',
  description: 'Do not record a ₹0 admin transaction in the purchase history',
}

async function askFeature(
  ctx: OpsContext,
  value: unknown,
): Promise<EntitlementFeature> {
  if (!value && !ctx.flags.interactive) return FEATURE_IDS.LIFETIME_PREMIUM
  return askChoice(ctx, value, {
    flag: '--feature',
    message: 'Which entitlement?',
    choices: [...FEATURE_CHOICES],
    default: FEATURE_IDS.LIFETIME_PREMIUM,
  })
}

/** Preview → confirm → RPC, shared by every entitlement action. */
export async function applyEntitlementChange(
  ctx: OpsContext,
  args: {
    user: SelectedUser
    feature: EntitlementFeature
    before: EntitlementRow | null
    status: EntitlementStatusValue
    validUntil: string | null
    action: string
    title: string
    notes?: string[]
    destructive?: boolean
    recordTransaction?: boolean
  },
): Promise<EntitlementOutcome> {
  const notes = [...(args.notes ?? [])]
  if (args.recordTransaction) {
    notes.push(
      "A ₹0 admin transaction will appear in the user's purchase history.",
    )
  }
  const accessAfter = hasAccess({
    status: args.status,
    valid_until: args.validUntil,
  })
  await confirmMutation(ctx, {
    title: `${args.title} · ${args.user.label}`,
    destructive: args.destructive,
    notes,
    changes: [
      { field: 'feature', before: args.feature, after: args.feature },
      {
        field: 'status',
        before: args.before?.status ?? 'none',
        after: args.status,
      },
      {
        field: 'expires',
        before: args.before ? expiryLabel(args.before.valid_until) : '',
        after: expiryLabel(args.validUntil),
      },
      {
        field: 'has access',
        before: hasAccess(args.before),
        after: accessAfter,
      },
    ],
  })
  const result = await ctx.ui.spin('Applying', () =>
    setEntitlement(ctx.db(), {
      userId: args.user.userId,
      featureId: args.feature,
      status: args.status,
      validUntil: args.validUntil,
      operator: ctx.operator,
      action: args.action,
      reason: ctx.flags.reason,
      recordTransaction: args.recordTransaction,
    }),
  )
  return { changed: true, userId: args.user.userId, ...result }
}

function renderOutcome(ctx: OpsContext, outcome: EntitlementOutcome) {
  if (!outcome.changed) {
    ctx.ui.info(`No change: ${outcome.reason}`)
    return
  }
  ctx.ui.success(
    `${outcome.after.feature_id} is now ${entitlementSummary(outcome.after)}.`,
  )
  ctx.ui.debug(
    `audit ${outcome.audit_id}${outcome.transaction_id ? ` · transaction ${outcome.transaction_id}` : ''}`,
  )
}

function noop(
  userId: string,
  reason: string,
  current: EntitlementRow | null,
): EntitlementOutcome {
  return { changed: false, userId, reason, current }
}

const grantLifetime = defineAction<EntitlementOutcome>({
  name: 'grant-lifetime',
  title: 'Grant Premium - Lifetime',
  description: 'Activates Premium - Lifetime (never expires) for a user.',
  mutates: true,
  options: [USER_OPTION, NO_TRANSACTION_OPTION],
  examples: [
    'premium grant-lifetime --user priya@example.com --reason "Paid by bank transfer"',
    'premium grant-lifetime --user <uuid> --env prod --confirm-ref <project-ref>',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const before = await getEntitlement(
      ctx.db(),
      user.userId,
      FEATURE_IDS.LIFETIME_PREMIUM,
    )
    if (before?.status === 'active' && before.valid_until === null) {
      return noop(
        user.userId,
        'the user already has Premium - Lifetime.',
        before,
      )
    }
    return applyEntitlementChange(ctx, {
      user,
      feature: FEATURE_IDS.LIFETIME_PREMIUM,
      before,
      status: 'active',
      validUntil: null,
      action: 'premium.grant_lifetime',
      title: 'Grant Premium - Lifetime',
      recordTransaction: options.transaction !== false,
    })
  },
  render: renderOutcome,
})

const trial = defineAction<EntitlementOutcome>({
  name: 'trial',
  title: 'Start a Premium trial',
  description: 'Gives Premium - Lifetime features as a time-limited trial.',
  mutates: true,
  options: [
    USER_OPTION,
    { flags: '--days <n>', description: 'Trial length in days (1-365)' },
  ],
  examples: ['premium trial --user priya@example.com --days 14'],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const days = await askValue(ctx, options.days, {
      flag: '--days',
      message: 'Trial length (days)',
      default: '14',
      parse: (value) => parseInteger(value, 'Days', { min: 1, max: 365 }),
    })
    const before = await getEntitlement(
      ctx.db(),
      user.userId,
      FEATURE_IDS.LIFETIME_PREMIUM,
    )
    const notes: string[] = []
    if (before && hasAccess(before) && before.status === 'active') {
      notes.push(
        `The user currently has active Premium; the trial will REPLACE it and end in ${days} days.`,
      )
    }
    return applyEntitlementChange(ctx, {
      user,
      feature: FEATURE_IDS.LIFETIME_PREMIUM,
      before,
      status: 'trialing',
      validUntil: addDays(days).toISOString(),
      action: 'premium.trial',
      title: `Start ${days}-day Premium trial`,
      notes,
      destructive: notes.length > 0,
    })
  },
  render: renderOutcome,
})

interface StatusActionConfig {
  name: string
  title: string
  description: string
  status: EntitlementStatusValue
  destructive?: boolean
  /** Returns a reason when the change makes no sense for the current row. */
  guard?(before: EntitlementRow | null): string | undefined
  validUntil?(before: EntitlementRow | null): string | null
}

function statusAction(config: StatusActionConfig): ActionDef<never> {
  return defineAction<EntitlementOutcome>({
    name: config.name,
    title: config.title,
    description: config.description,
    mutates: true,
    options: [USER_OPTION, FEATURE_OPTION],
    examples: [
      `premium ${config.name} --user priya@example.com --reason "..."`,
    ],
    async run(ctx, options) {
      const user = await selectUser(ctx, options.user)
      const feature = await askFeature(ctx, options.feature)
      const before = await getEntitlement(ctx.db(), user.userId, feature)
      if (!before) {
        throw new UsageError(
          `The user has no ${feature} entitlement to ${config.name}.`,
        )
      }
      if (before.status === config.status) {
        return noop(
          user.userId,
          `${feature} is already ${config.status}.`,
          before,
        )
      }
      const problem = config.guard?.(before)
      if (problem) throw new UsageError(problem)
      return applyEntitlementChange(ctx, {
        user,
        feature,
        before,
        status: config.status,
        validUntil: config.validUntil
          ? config.validUntil(before)
          : before.valid_until,
        action: `premium.${config.name}`,
        title: config.title,
        destructive: config.destructive,
      })
    },
    render: renderOutcome,
  })
}

const pause = statusAction({
  name: 'pause',
  title: 'Pause an entitlement',
  description:
    'Suspends access without changing the expiry. Resume restores it.',
  status: 'paused',
  destructive: true,
})

const resume = statusAction({
  name: 'resume',
  title: 'Resume an entitlement',
  description:
    'Re-activates a paused or cancelled entitlement with its existing expiry.',
  status: 'active',
  guard(before) {
    if (before?.valid_until && Date.parse(before.valid_until) <= Date.now()) {
      return `The entitlement expired on ${formatDateTime(before.valid_until)}; use \`premium extend\` or \`premium set-expiry\` instead.`
    }
    return undefined
  },
})

const cancel = statusAction({
  name: 'cancel',
  title: 'Cancel an entitlement',
  description:
    'Marks the entitlement cancelled (access stops now). Reversible with resume.',
  status: 'canceled',
  destructive: true,
})

const revoke = statusAction({
  name: 'revoke',
  title: 'Revoke an entitlement',
  description:
    'Expires the entitlement immediately (status expired, expiry now).',
  status: 'expired',
  destructive: true,
  validUntil: () => new Date().toISOString(),
})

const extend = defineAction<EntitlementOutcome>({
  name: 'extend',
  title: 'Extend an expiry',
  description:
    'Adds days to the current expiry (or to today if already expired) and makes it active. For subscriptions with a quota pool prefer `quota sub`, which also refreshes the quota.',
  mutates: true,
  options: [
    USER_OPTION,
    FEATURE_OPTION,
    { flags: '--days <n>', description: 'Days to add (1-3650)' },
  ],
  examples: ['premium extend --user priya@example.com --days 30'],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const feature = await askFeature(ctx, options.feature)
    const before = await getEntitlement(ctx.db(), user.userId, feature)
    if (!before)
      throw new UsageError(`The user has no ${feature} entitlement to extend.`)
    if (before.valid_until === null) {
      return noop(user.userId, `${feature} never expires.`, before)
    }
    const days = await askValue(ctx, options.days, {
      flag: '--days',
      message: 'Days to add',
      parse: (value) => parseInteger(value, 'Days', { min: 1, max: 3650 }),
    })
    const base = Math.max(Date.parse(before.valid_until), Date.now())
    const status = before.status === 'trialing' ? 'trialing' : 'active'
    return applyEntitlementChange(ctx, {
      user,
      feature,
      before,
      status,
      validUntil: addDays(days, new Date(base)).toISOString(),
      action: 'premium.extend',
      title: `Extend ${feature} by ${days} days`,
      notes:
        feature === FEATURE_IDS.LIFETIME_PREMIUM
          ? []
          : [
              'The quota pool reset date is not changed; use `quota sub` to extend both.',
            ],
    })
  },
  render: renderOutcome,
})

const setExpiry = defineAction<EntitlementOutcome>({
  name: 'set-expiry',
  title: 'Set an exact expiry',
  description:
    'Sets the expiry to a date (YYYY-MM-DD = end of that day, UTC) or "never".',
  mutates: true,
  options: [
    USER_OPTION,
    FEATURE_OPTION,
    { flags: '--until <date|never>', description: 'New expiry' },
  ],
  examples: [
    'premium set-expiry --user priya@example.com --until 2026-12-31',
    'premium set-expiry --user <uuid> --until never',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const feature = await askFeature(ctx, options.feature)
    const before = await getEntitlement(ctx.db(), user.userId, feature)
    const validUntil = await askValue(ctx, options.until, {
      flag: '--until',
      message: 'New expiry (YYYY-MM-DD or "never")',
      parse: (value) =>
        value.trim().toLowerCase() === 'never'
          ? null
          : parseFutureDate(value, 'Expiry'),
    })
    if (validUntil === null && before?.status === 'trialing') {
      throw new UsageError(
        'A trial must have an end date; use `premium grant-lifetime` to convert it.',
      )
    }
    const status: EntitlementStatusValue =
      before?.status === 'trialing' ? 'trialing' : 'active'
    return applyEntitlementChange(ctx, {
      user,
      feature,
      before,
      status,
      validUntil,
      action: 'premium.set_expiry',
      title: `Set ${feature} expiry`,
    })
  },
  render: renderOutcome,
})

export const premiumGroup: GroupDef = {
  name: 'premium',
  title: 'Premium: lifetime, trials, pause/resume, expiry',
  description: 'Grant and manage Premium - Lifetime and pack entitlements.',
  actions: [
    grantLifetime,
    trial,
    extend,
    setExpiry,
    pause,
    resume,
    cancel,
    revoke,
  ],
}
