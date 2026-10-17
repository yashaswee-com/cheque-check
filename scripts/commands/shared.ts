import type { OptionDef } from '../lib/action'
import type { OpsContext, SelectedUser } from '../lib/context'
import { NotFoundError, UsageError } from '../lib/errors'
import { formatDateTime, shortId } from '../lib/format'
import type { Choice } from '../lib/prompts'
import { promptValidator, type Parser } from '../lib/validators'
import { searchUsers, type UserMatch } from '../domain/users'

export const USER_OPTION: OptionDef = {
  flags: '--user <query>',
  description: 'User: email, phone, user id, business id, or part of a name',
}

function labelFor(match: Pick<UserMatch, 'email' | 'name' | 'userId'>) {
  const who = match.email ?? match.name ?? 'no email'
  return `${who} (${shortId(match.userId)})`
}

/**
 * Resolves `--user` (or prompts for it) to exactly one user. In the hub the
 * last selected user is offered again so a support session can run several
 * actions for the same person without re-searching.
 */
export async function selectUser(
  ctx: OpsContext,
  query: unknown,
): Promise<SelectedUser> {
  let text = typeof query === 'string' ? query.trim() : ''

  if (!text && ctx.session.user && ctx.flags.interactive) {
    const reuse = await ctx.prompt.confirm(
      `Continue with ${ctx.session.user.label}?`,
      true,
    )
    if (reuse) return ctx.session.user
  }
  if (!text) {
    text = await ctx.prompt.text({
      message: 'Find user (email, phone, user id, business id, or name)',
      flag: '--user',
      validate: (value) =>
        value.trim() ? true : 'Enter something to search for.',
    })
  }

  const matches = await ctx.ui.spin(`Searching for "${text}"`, () =>
    searchUsers(ctx.db(), text),
  )
  if (matches.length === 0) {
    throw new NotFoundError(
      `No user matches "${text}".`,
      'Try an exact email, the user id, or `npm run ops -- user find`.',
    )
  }

  let match = matches[0]
  if (matches.length > 1) {
    if (!ctx.flags.interactive) {
      const list = matches
        .slice(0, 5)
        .map((item) => `${item.userId} ${item.email ?? item.name ?? ''}`.trim())
        .join('; ')
      throw new UsageError(
        `"${text}" matches ${matches.length} users.`,
        `Pass the exact user id. Candidates: ${list}`,
      )
    }
    const userId = await ctx.prompt.select({
      message: `${matches.length} users match. Which one?`,
      choices: matches.map((item) => ({
        value: item.userId,
        name: `${labelFor(item)}${item.deletedAt ? ' [deleted]' : ''}`,
        description: `matched by ${item.matchedBy}${item.phone ? ` · ${item.phone}` : ''}`,
      })),
    })
    match = matches.find((item) => item.userId === userId) ?? match
  }

  if (match.deletedAt) {
    ctx.ui.warn(
      `This profile was deleted on ${formatDateTime(match.deletedAt)}.`,
    )
  }
  const selected = {
    userId: match.userId,
    label: labelFor(match),
    email: match.email,
  }
  ctx.session.user = selected
  ctx.ui.info(`User: ${selected.label}`)
  return selected
}

/** Uses the flag value when given (validated), otherwise prompts with the same validation. */
export async function askValue<T>(
  ctx: OpsContext,
  value: unknown,
  options: {
    flag: string
    message: string
    parse: Parser<T>
    default?: string
  },
): Promise<T> {
  if (value !== undefined && value !== null && value !== '') {
    return options.parse(String(value))
  }
  const answer = await ctx.prompt.text({
    message: options.message,
    flag: options.flag,
    default: options.default,
    validate: promptValidator(options.parse),
  })
  return options.parse(answer)
}

/** Same as askValue, but for a fixed set of choices. */
export async function askChoice<T extends string>(
  ctx: OpsContext,
  value: unknown,
  options: { flag: string; message: string; choices: Choice<T>[]; default?: T },
): Promise<T> {
  if (value !== undefined && value !== null && value !== '') {
    const match = options.choices.find((choice) => choice.value === value)
    if (!match) {
      throw new UsageError(
        `${options.flag} must be one of: ${options.choices.map((choice) => choice.value).join(', ')}.`,
      )
    }
    return match.value
  }
  return ctx.prompt.select({
    message: options.message,
    flag: options.flag,
    choices: options.choices,
    default: options.default,
  })
}

/** Optional input: flag value if given; prompt (blank = skip) only when interactive. */
export async function askOptional<T>(
  ctx: OpsContext,
  value: unknown,
  options: { message: string; parse: Parser<T> },
): Promise<T | undefined> {
  if (value !== undefined && value !== null && value !== '') {
    return options.parse(String(value))
  }
  if (!ctx.flags.interactive) return undefined
  const answer = await ctx.prompt.text({
    message: `${options.message} (leave blank to skip)`,
    validate: (input) =>
      input.trim() ? promptValidator(options.parse)(input) : true,
  })
  return answer ? options.parse(answer) : undefined
}

export const LIMIT_OPTION: OptionDef = {
  flags: '--limit <n>',
  description: 'Maximum rows to show',
  defaultValue: '20',
}
