import { FEATURE_IDS } from '../../src/features/monetization/constants'
import { defineAction, type GroupDef } from '../lib/action'
import { formatDateTime, shortId } from '../lib/format'
import { parseChoice, parseInteger } from '../lib/validators'
import {
  getUserSnapshot,
  listEntitlementHolders,
  searchUsers,
  type EntitlementRow,
  type UserMatch,
  type UserSnapshot,
} from '../domain/users'
import {
  entitlementTable,
  expiryLabel,
  jobTable,
  quotaTable,
  transactionTable,
} from './render'
import { askValue, LIMIT_OPTION, selectUser, USER_OPTION } from './shared'

const ENTITLEMENT_FEATURES = [
  FEATURE_IDS.LIFETIME_PREMIUM,
  FEATURE_IDS.VOICE_REMINDER_SUB,
  FEATURE_IDS.AI_SCANNER_SUB,
] as const
const STATUSES = [
  'active',
  'trialing',
  'paused',
  'canceled',
  'expired',
] as const

const find = defineAction<UserMatch[]>({
  name: 'find',
  title: 'Find a user',
  description:
    'Search users by email, phone, user id, business id, or part of a name/email/business name.',
  mutates: false,
  options: [{ flags: '--query <text>', description: 'What to search for' }],
  examples: [
    'user find --query priya',
    'user find --query +919876543210 --json',
  ],
  async run(ctx, options) {
    const query = await askValue(ctx, options.query, {
      flag: '--query',
      message: 'Search (email, phone, user id, business id, or name)',
      parse: (value) => value.trim() || parseChoice(value, [], 'Query'),
    })
    return ctx.ui.spin('Searching', () => searchUsers(ctx.db(), query))
  },
  render(ctx, matches) {
    ctx.ui.table(
      matches.map((match) => ({
        user_id: match.userId,
        email: match.email,
        name: match.name,
        phone: match.phone,
        matched_by: match.matchedBy,
        deleted: match.deletedAt ? formatDateTime(match.deletedAt) : '',
      })),
      'No users found.',
    )
  },
})

const show = defineAction<UserSnapshot>({
  name: 'show',
  title: 'Show a user snapshot',
  description:
    'Everything support usually needs in one view: account, premium state, entitlements, quotas, businesses, recent payments and notification jobs.',
  mutates: false,
  options: [USER_OPTION],
  examples: [
    'user show --user priya@example.com',
    'user show --user <uuid> --json',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    return ctx.ui.spin('Loading snapshot', () =>
      getUserSnapshot(ctx.db(), user.userId),
    )
  },
  render(ctx, snapshot) {
    const { ui } = ctx
    const profile = snapshot.profile
    ui.section('Account')
    ui.kv({
      'User id': snapshot.userId,
      Email: snapshot.auth.email,
      Name: profile?.name,
      Phone: profile?.phone,
      'Signed up': formatDateTime(snapshot.auth.createdAt),
      'Last sign-in': formatDateTime(snapshot.auth.lastSignInAt),
      'Email confirmed': Boolean(snapshot.auth.emailConfirmedAt),
      'Banned until': snapshot.auth.bannedUntil
        ? formatDateTime(snapshot.auth.bannedUntil)
        : '',
      'Profile deleted': profile?.deleted_at
        ? formatDateTime(profile.deleted_at)
        : '',
    })
    ui.section('Reminders')
    ui.kv({
      'Voice calls': profile?.voice_call_enabled ?? false,
      SMS: profile?.sms_enabled ?? false,
      'Time zone': profile?.time_zone,
      Language: profile?.language,
      'Reminders/day': profile?.reminders_per_day,
    })
    ui.section('Premium')
    ui.kv({
      'Lifetime Premium': snapshot.premium.state,
      Expires:
        snapshot.premium.state === 'free'
          ? ''
          : expiryLabel(snapshot.premium.validUntil),
    })
    ui.section('Entitlements')
    ui.table(entitlementTable(snapshot.entitlements), 'No entitlements.')
    ui.section('Quotas')
    ui.table(quotaTable(snapshot.quotas), 'No quotas.')
    ui.section('Businesses')
    ui.table(
      snapshot.businesses.map((business) => ({
        id: shortId(business.id),
        name: business.name,
        phone: business.phone,
        cheques: business.cheques,
        deleted: business.deleted_at ? formatDateTime(business.deleted_at) : '',
      })),
      'No businesses (the user is still in onboarding).',
    )
    ui.section('Recent transactions')
    ui.table(transactionTable(snapshot.transactions), 'No transactions.')
    ui.section('Recent notification jobs')
    ui.table(jobTable(snapshot.jobs), 'No notification jobs.')
  },
})

const listPremium = defineAction<
  Awaited<ReturnType<typeof listEntitlementHolders>>
>({
  name: 'list-premium',
  title: 'List premium / subscription holders',
  description: 'Lists users holding an entitlement, newest change first.',
  mutates: false,
  options: [
    {
      flags: '--feature <feature>',
      description: 'Entitlement to list',
      choices: ENTITLEMENT_FEATURES,
      defaultValue: FEATURE_IDS.LIFETIME_PREMIUM,
    },
    {
      flags: '--status <status>',
      description: 'Only this status',
      choices: STATUSES,
    },
    LIMIT_OPTION,
  ],
  examples: [
    'user list-premium --status trialing',
    'user list-premium --feature voice_reminder_sub --json',
  ],
  async run(ctx, options) {
    return listEntitlementHolders(ctx.db(), {
      featureId:
        (options.feature as EntitlementRow['feature_id']) ??
        FEATURE_IDS.LIFETIME_PREMIUM,
      status: options.status as EntitlementRow['status'] | undefined,
      limit: parseInteger(String(options.limit ?? 20), '--limit', {
        min: 1,
        max: 1000,
      }),
    })
  },
  render(ctx, rows) {
    ctx.ui.table(
      rows.map((row) => ({
        user_id: row.userId,
        email: row.email,
        status: row.status,
        expires: expiryLabel(row.validUntil),
        updated: formatDateTime(row.updatedAt),
      })),
      'Nobody matches.',
    )
  },
})

export const userGroup: GroupDef = {
  name: 'user',
  title: 'Users: find, inspect, list',
  description: 'Look up users and see their full support snapshot.',
  actions: [find, show, listPremium],
}
