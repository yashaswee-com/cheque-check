import { defineAction, type GroupDef, type OptionDef } from '../lib/action'
import { writeAudit } from '../lib/audit'
import { UsageError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { confirmMutation, type Change } from '../lib/guards'
import {
  LANGUAGES,
  parseBoolean,
  parseEmail,
  parseInteger,
  parseLanguage,
  parsePhone,
  parseTimeZone,
  parseUuid,
} from '../lib/validators'
import {
  BAN_PRESETS,
  changeEmail,
  getRestorable,
  listDeleted,
  listRateLimits,
  resetRateLimits,
  restoreRecord,
  RESTORABLE,
  sendAuthEmail,
  setBan,
  updateProfile,
  type AuthEmailKind,
  type BanPreset,
  type ProfilePatch,
  type RestorableKind,
  type RestorableRecord,
} from '../domain/accounts'
import {
  getAuthSummary,
  requireProfile,
  type ProfileRow,
} from '../domain/users'
import { askChoice, askValue, selectUser, USER_OPTION } from './shared'

type ProfileField = keyof ProfilePatch

interface FieldSpec {
  flag: string
  option: string
  label: string
  hint: string
  parse: (value: string) => ProfilePatch[ProfileField]
}

const nullable =
  <T>(parse: (value: string) => T) =>
  (value: string) =>
    ['none', 'null', ''].includes(value.trim().toLowerCase())
      ? null
      : parse(value)

const PROFILE_FIELDS: Record<ProfileField, FieldSpec> = {
  phone: {
    flag: '--phone <phone>',
    option: 'phone',
    label: 'Phone',
    hint: 'E.164 or Indian number; "none" clears it',
    parse: nullable((value) => parsePhone(value)),
  },
  time_zone: {
    flag: '--time-zone <tz>',
    option: 'timeZone',
    label: 'Time zone',
    hint: 'IANA name, e.g. Asia/Kolkata',
    parse: (value) => parseTimeZone(value),
  },
  language: {
    flag: '--language <lang>',
    option: 'language',
    label: 'Call language',
    hint: LANGUAGES.join(', '),
    parse: (value) => parseLanguage(value),
  },
  voice_call_enabled: {
    flag: '--voice <on|off>',
    option: 'voice',
    label: 'Voice reminder calls',
    hint: 'on/off',
    parse: (value) => parseBoolean(value, '--voice'),
  },
  sms_enabled: {
    flag: '--sms <on|off>',
    option: 'sms',
    label: 'SMS reminders',
    hint: 'on/off',
    parse: (value) => parseBoolean(value, '--sms'),
  },
  reminders_per_day: {
    flag: '--reminders-per-day <n>',
    option: 'remindersPerDay',
    label: 'Reminders per day',
    hint: '1-3',
    parse: (value) =>
      parseInteger(value, 'Reminders per day', { min: 1, max: 3 }),
  },
}
const FIELD_KEYS = Object.keys(PROFILE_FIELDS) as ProfileField[]

type ProfileOutcome = {
  userId: string
  before: ProfilePatch
  after: ProfileRow
}

const profile = defineAction<ProfileOutcome>({
  name: 'profile',
  title: 'Fix reminder settings (phone, time zone, language...)',
  description:
    'Edits the profile fields that drive reminders. Only the fields you pass are changed.',
  mutates: true,
  options: [
    USER_OPTION,
    ...FIELD_KEYS.map((key): OptionDef => ({
      flags: PROFILE_FIELDS[key].flag,
      description: `${PROFILE_FIELDS[key].label} (${PROFILE_FIELDS[key].hint})`,
    })),
  ],
  examples: [
    'account profile --user priya@example.com --phone 9876543210 --time-zone Asia/Kolkata',
    'account profile --user <uuid> --voice on --reminders-per-day 2',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const current = await requireProfile(ctx.db(), user.userId)
    const patch: ProfilePatch = {}
    for (const key of FIELD_KEYS) {
      const raw = options[PROFILE_FIELDS[key].option]
      if (raw !== undefined)
        Object.assign(patch, { [key]: PROFILE_FIELDS[key].parse(String(raw)) })
    }

    if (Object.keys(patch).length === 0) {
      if (!ctx.flags.interactive) {
        throw new UsageError(
          'Nothing to change.',
          `Pass at least one of: ${FIELD_KEYS.map((key) => PROFILE_FIELDS[key].flag.split(' ')[0]).join(', ')}.`,
        )
      }
      for (;;) {
        const field = await ctx.prompt.select<ProfileField | 'done'>({
          message: 'Which field?',
          choices: [
            ...FIELD_KEYS.map((key) => ({
              value: key,
              name: `${PROFILE_FIELDS[key].label}: ${String(key in patch ? patch[key] : (current[key] ?? '—'))}`,
            })),
            {
              value: 'done',
              name: Object.keys(patch).length ? 'Review changes' : 'Cancel',
            },
          ],
        })
        if (field === 'done') break
        const spec = PROFILE_FIELDS[field]
        const value = await askValue(ctx, undefined, {
          flag: spec.flag.split(' ')[0],
          message: `${spec.label} (${spec.hint})`,
          default: current[field] === null ? undefined : String(current[field]),
          parse: spec.parse,
        })
        Object.assign(patch, { [field]: value })
      }
      if (Object.keys(patch).length === 0)
        throw new UsageError('Nothing to change.')
    }

    const keys = Object.keys(patch) as ProfileField[]
    const before = Object.fromEntries(
      keys.map((key) => [key, current[key]]),
    ) as ProfilePatch
    const notes: string[] = []
    if (patch.voice_call_enabled && !(patch.phone ?? current.phone)) {
      notes.push(
        'Voice calls are on but there is no phone number, so no calls can be placed.',
      )
    }
    await confirmMutation(ctx, {
      title: `Update profile · ${user.label}`,
      notes,
      changes: keys.map((key): Change => ({
        field: PROFILE_FIELDS[key].label,
        before: before[key] ?? '',
        after: patch[key] ?? '',
      })),
    })
    const after = await updateProfile(ctx.db(), user.userId, patch)
    await writeAudit(ctx, {
      action: 'account.profile_update',
      targetUserId: user.userId,
      targetType: 'profile',
      targetId: after.id,
      before,
      after: patch,
    })
    return { userId: user.userId, before, after }
  },
  render(ctx) {
    ctx.ui.success('Profile updated.')
  },
})

const magicLink = defineAction<{ email: string; kind: AuthEmailKind }>({
  name: 'magic-link',
  title: 'Email a sign-in or password-reset link',
  description:
    'Asks Supabase Auth to email the user a one-time sign-in link or a password-reset link. The link is never shown to you.',
  mutates: true,
  options: [
    USER_OPTION,
    {
      flags: '--kind <kind>',
      description: 'magic-link or password-reset',
      choices: ['magic-link', 'password-reset'],
    },
    {
      flags: '--app-url <url>',
      description: 'Where the link lands (default: the project Site URL)',
    },
  ],
  examples: [
    'account magic-link --user priya@example.com',
    'account magic-link --user priya@example.com --kind password-reset --app-url https://app.example.com',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    if (!user.email) throw new UsageError('This user has no email address.')
    const kind = await askChoice<AuthEmailKind>(
      ctx,
      options.kind ?? (ctx.flags.interactive ? undefined : 'magic-link'),
      {
        flag: '--kind',
        message: 'Which email?',
        choices: [
          { value: 'magic-link', name: 'One-time sign-in link' },
          { value: 'password-reset', name: 'Password reset link' },
        ],
      },
    )
    const appUrl = options.appUrl ? parseUrl(String(options.appUrl)) : undefined
    await confirmMutation(ctx, {
      title: `Email a ${kind} link to ${user.email}`,
      notes: [
        appUrl
          ? `Link lands on ${appUrl}.`
          : 'Link lands on the project Site URL (Auth → URL Configuration).',
      ],
      changes: [],
    })
    await ctx.ui.spin('Sending', () =>
      sendAuthEmail(ctx.anon(), user.email as string, kind, appUrl),
    )
    await writeAudit(ctx, {
      action: `account.${kind.replace('-', '_')}`,
      targetUserId: user.userId,
      targetType: 'auth_user',
      targetId: user.userId,
      metadata: { appUrl: appUrl ?? null },
    })
    return { email: user.email, kind }
  },
  render(ctx, outcome) {
    ctx.ui.success(
      `Sent a ${outcome.kind} email to ${outcome.email}. Links expire after about an hour.`,
    )
  },
})

function parseUrl(value: string): string {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) throw new Error()
    return url.origin
  } catch {
    throw new UsageError(`"${value}" is not an http(s) URL.`)
  }
}

const changeEmailAction = defineAction<{
  userId: string
  from: string | null
  to: string
}>({
  name: 'change-email',
  title: "Change a user's login email",
  description:
    'Changes the sign-in email (no confirmation email is sent) and syncs it to the profile.',
  mutates: true,
  options: [
    USER_OPTION,
    { flags: '--email <email>', description: 'New email address' },
  ],
  examples: [
    'account change-email --user old@example.com --email new@example.com',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const email = await askValue(ctx, options.email, {
      flag: '--email',
      message: 'New email',
      parse: (value) => parseEmail(value),
    })
    if (email === user.email?.toLowerCase())
      throw new UsageError("That is already the user's email.")
    await confirmMutation(ctx, {
      title: `Change login email · ${user.label}`,
      notes: [
        'The user signs in with the new address immediately; the old one stops working.',
      ],
      destructive: true,
      changes: [{ field: 'email', before: user.email ?? '', after: email }],
    })
    await ctx.ui.spin('Changing email', () =>
      changeEmail(ctx.db(), user.userId, email),
    )
    await writeAudit(ctx, {
      action: 'account.change_email',
      targetUserId: user.userId,
      targetType: 'auth_user',
      targetId: user.userId,
      before: { email: user.email },
      after: { email },
    })
    ctx.session.user = {
      ...user,
      email,
      label: user.label.replace(user.email ?? '', email),
    }
    return { userId: user.userId, from: user.email, to: email }
  },
  render(ctx, outcome) {
    ctx.ui.success(`Login email changed to ${outcome.to}.`)
  },
})

const BAN_CHOICES = Object.keys(BAN_PRESETS) as BanPreset[]

const ban = defineAction<{ userId: string; bannedUntil: string | null }>({
  name: 'ban',
  title: 'Ban or unban a user',
  description:
    'Blocks sign-in (and session refresh) for a period, or lifts a ban with --duration none. Data is untouched.',
  mutates: true,
  options: [
    USER_OPTION,
    {
      flags: '--duration <duration>',
      description: `${BAN_CHOICES.join(', ')}, or hours like 48h`,
    },
  ],
  examples: [
    'account ban --user spam@example.com --duration 7d --reason "Abuse"',
    'account ban --user <uuid> --duration none',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const auth = await getAuthSummary(ctx.db(), user.userId)
    let duration: string
    if (options.duration) {
      duration = parseBanDuration(String(options.duration))
    } else {
      const choice = await ctx.prompt.select<BanPreset | 'custom'>({
        message: 'Ban for how long?',
        flag: '--duration',
        choices: [
          ...BAN_CHOICES.map((preset) => ({
            value: preset,
            name: preset === 'none' ? 'Lift the ban' : preset,
          })),
          { value: 'custom', name: 'Custom (hours)' },
        ],
      })
      duration =
        choice === 'custom'
          ? await askValue(ctx, undefined, {
              flag: '--duration',
              message: 'Hours (e.g. 48h)',
              parse: parseBanDuration,
            })
          : BAN_PRESETS[choice]
    }
    const lifting = duration === 'none'
    if (lifting && !auth.bannedUntil)
      throw new UsageError('The user is not banned.')
    await confirmMutation(ctx, {
      title: `${lifting ? 'Unban' : 'Ban'} · ${user.label}`,
      destructive: !lifting,
      notes: lifting
        ? []
        : [
            'The user is signed out when their session next refreshes and cannot sign in.',
          ],
      changes: [
        {
          field: 'banned until',
          before: auth.bannedUntil
            ? formatDateTime(auth.bannedUntil)
            : 'not banned',
          after: lifting
            ? 'not banned'
            : duration === BAN_PRESETS.permanent
              ? 'permanently'
              : `now + ${duration}`,
        },
      ],
    })
    const bannedUntil = await setBan(ctx.db(), user.userId, duration)
    await writeAudit(ctx, {
      action: lifting ? 'account.unban' : 'account.ban',
      targetUserId: user.userId,
      targetType: 'auth_user',
      targetId: user.userId,
      before: { banned_until: auth.bannedUntil },
      after: { banned_until: bannedUntil },
      metadata: { duration },
    })
    return { userId: user.userId, bannedUntil }
  },
  render(ctx, outcome) {
    ctx.ui.success(
      outcome.bannedUntil
        ? `Banned until ${formatDateTime(outcome.bannedUntil)}.`
        : 'Ban lifted.',
    )
  },
})

export function parseBanDuration(value: string): string {
  const normalised = value.trim().toLowerCase()
  if (normalised in BAN_PRESETS) return BAN_PRESETS[normalised as BanPreset]
  const hours = /^(\d+)h$/.exec(normalised)
  if (hours && Number(hours[1]) > 0) return `${Number(hours[1])}h`
  throw new UsageError(
    `Invalid duration "${value}".`,
    `Use ${BAN_CHOICES.join(', ')}, or hours like 48h.`,
  )
}

const RESTORE_KINDS = Object.keys(RESTORABLE) as RestorableKind[]

const restore = defineAction<RestorableRecord>({
  name: 'restore',
  title: 'Restore a deleted record and its deletion batch',
  description:
    'Restores only the selected deletion batch, rejecting inactive parents or active-name conflicts. Without --id, lists deleted records to pick from.',
  mutates: true,
  options: [
    {
      flags: '--kind <kind>',
      description: 'What to restore',
      choices: RESTORE_KINDS,
    },
    {
      flags: '--id <id>',
      description: "Record id (skip to pick from the user's deleted records)",
    },
    { flags: '--user <query>', description: 'Owner, when picking from a list' },
  ],
  examples: [
    'account restore --kind business --id <uuid>',
    'account restore --kind party --user priya@example.com',
  ],
  async run(ctx, options) {
    const kind = await askChoice<RestorableKind>(ctx, options.kind, {
      flag: '--kind',
      message: 'What to restore?',
      choices: RESTORE_KINDS.map((value) => ({ value, name: value })),
    })
    let id: string
    if (options.id) {
      id = parseUuid(String(options.id), '--id')
    } else {
      const user = await selectUser(ctx, options.user)
      const deleted = await listDeleted(ctx.db(), kind, user.userId)
      if (deleted.length === 0)
        throw new UsageError(`${user.label} has no deleted ${kind} records.`)
      if (!ctx.flags.interactive)
        throw new UsageError(
          'Pass --id.',
          `Deleted: ${deleted.map((row) => `${row.id} ${row.name ?? ''}`).join('; ')}`,
        )
      id = await ctx.prompt.select({
        message: `Which ${kind}?`,
        choices: deleted.map((row) => ({
          value: row.id,
          name: `${row.name ?? row.id} (deleted ${formatDateTime(row.deletedAt)})`,
        })),
      })
    }
    const record = await getRestorable(ctx.db(), kind, id)
    if (!record.deletedAt)
      throw new UsageError(`The ${kind} "${record.name ?? id}" is not deleted.`)
    const notes = record.parentDeletedAt
      ? [
          `Its business is deleted (${formatDateTime(record.parentDeletedAt)}); restore that business batch first. This restore will otherwise fail.`,
        ]
      : []
    await confirmMutation(ctx, {
      title: `Restore ${kind} "${record.name ?? id}"`,
      notes,
      changes: [
        {
          field: 'deleted_at',
          before: formatDateTime(record.deletedAt),
          after: 'not deleted',
        },
      ],
    })
    await restoreRecord(ctx.db(), kind, id)
    await writeAudit(ctx, {
      action: `account.restore_${kind}`,
      targetUserId: record.ownerId,
      targetType: kind,
      targetId: id,
      before: {
        deleted_at: record.deletedAt,
        deletion_batch_id: record.deletionBatchId,
      },
      after: { deleted_at: null },
    })
    return record
  },
  render(ctx, record) {
    ctx.ui.success(`Restored ${record.kind} "${record.name ?? record.id}".`)
    if (record.parentDeletedAt) ctx.ui.warn('Its business is still deleted.')
  },
})

type RateLimitRow = Awaited<ReturnType<typeof listRateLimits>>[number]

const rateLimits = defineAction<RateLimitRow[]>({
  name: 'rate-limits',
  title: "Show a user's API rate-limit counters",
  description:
    'Lists the current rate-limit windows (e.g. AI scan / payment endpoints) for a user.',
  mutates: false,
  options: [USER_OPTION],
  examples: ['account rate-limits --user priya@example.com'],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    return listRateLimits(ctx.db(), user.userId)
  },
  render(ctx, rows) {
    ctx.ui.table(
      rows.map((row) => ({
        endpoint: row.endpoint,
        requests: row.request_count,
        window_started: formatDateTime(row.window_started_at),
      })),
      'No rate-limit counters.',
    )
  },
})

const rateLimitsReset = defineAction<{ userId: string; cleared: number }>({
  name: 'rate-limits-reset',
  title: "Reset a user's API rate limits",
  description:
    'Clears rate-limit counters so a blocked user can retry immediately.',
  mutates: true,
  options: [
    USER_OPTION,
    {
      flags: '--endpoint <name>',
      description: 'Only this endpoint (default: all)',
    },
  ],
  examples: [
    'account rate-limits-reset --user priya@example.com',
    'account rate-limits-reset --user <uuid> --endpoint ai-scan',
  ],
  async run(ctx, options) {
    const user = await selectUser(ctx, options.user)
    const rows = await listRateLimits(ctx.db(), user.userId)
    const endpoint = options.endpoint ? String(options.endpoint) : undefined
    const affected = endpoint
      ? rows.filter((row) => row.endpoint === endpoint)
      : rows
    if (affected.length === 0) {
      return { userId: user.userId, cleared: 0 }
    }
    await confirmMutation(ctx, {
      title: `Reset rate limits · ${user.label}`,
      changes: affected.map((row) => ({
        field: row.endpoint,
        before: `${row.request_count} requests`,
        after: 'cleared',
      })),
    })
    const cleared = await resetRateLimits(ctx.db(), user.userId, endpoint)
    await writeAudit(ctx, {
      action: 'account.rate_limit_reset',
      targetUserId: user.userId,
      targetType: 'api_rate_limits',
      before: affected,
      metadata: { endpoint: endpoint ?? null },
    })
    return { userId: user.userId, cleared }
  },
  render(ctx, outcome) {
    if (outcome.cleared === 0)
      ctx.ui.info('No matching rate-limit counters; nothing to reset.')
    else ctx.ui.success(`Cleared ${outcome.cleared} counter(s).`)
  },
})

export const accountGroup: GroupDef = {
  name: 'account',
  title: 'Accounts: profile, sign-in, ban, restore, rate limits',
  description: 'Fix account problems users cannot fix themselves.',
  actions: [
    profile,
    magicLink,
    changeEmailAction,
    ban,
    restore,
    rateLimits,
    rateLimitsReset,
  ],
}
