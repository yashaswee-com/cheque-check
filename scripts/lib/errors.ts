export const EXIT_CODES = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  ABORTED: 3,
  NOT_FOUND: 4,
  GUARD_REFUSED: 5,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

export class OpsError extends Error {
  readonly exitCode: ExitCode
  readonly hint?: string

  constructor(
    message: string,
    options: { exitCode?: ExitCode; hint?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.exitCode = options.exitCode ?? EXIT_CODES.ERROR
    this.hint = options.hint
  }
}

/** Bad or missing CLI input. */
export class UsageError extends OpsError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: EXIT_CODES.USAGE, hint })
  }
}

/** The operator cancelled (Ctrl+C, answered "no"). */
export class AbortedError extends OpsError {
  constructor(message = 'Cancelled. No changes were made.') {
    super(message, { exitCode: EXIT_CODES.ABORTED })
  }
}

export class NotFoundError extends OpsError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: EXIT_CODES.NOT_FOUND, hint })
  }
}

/** A safety guard (production, allowlist) refused to proceed. */
export class GuardRefusedError extends OpsError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: EXIT_CODES.GUARD_REFUSED, hint })
  }
}

/** --dry-run stopped execution after the preview; not a failure. */
export class DryRunComplete extends OpsError {
  constructor() {
    super('Dry run complete. No changes were made.', {
      exitCode: EXIT_CODES.OK,
    })
  }
}

const MIGRATION_HINT =
  'Apply supabase/migrations/20261018000000_admin_ops.sql to this project (npx supabase db push), then run `npm run ops -- ops doctor`.'

interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

function isPostgrestLike(error: unknown): error is PostgrestLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'details' in error)
  )
}

/** Converts Supabase/PostgREST/Auth errors into typed OpsErrors with actionable hints. */
export function toOpsError(error: unknown, context?: string): OpsError {
  if (error instanceof OpsError) return error

  const prefix = context ? `${context}: ` : ''

  if (error instanceof Error && error.name === 'ExitPromptError') {
    return new AbortedError()
  }

  if (isPostgrestLike(error)) {
    const message = `${prefix}${error.message ?? 'Database error'}`
    switch (error.code) {
      case 'P0002':
      case 'PGRST116':
        return new NotFoundError(message)
      case '22023':
      case '23514':
      case '22P02':
        return new OpsError(message, { exitCode: EXIT_CODES.USAGE })
      case '23505':
        return new OpsError(message, {
          hint: 'A conflicting record already exists.',
        })
      case '42883':
      case 'PGRST202':
      case '42P01':
      case 'PGRST205':
        return new OpsError(message, { hint: MIGRATION_HINT })
      case '42501':
        return new OpsError(message, {
          hint: 'Check that SUPABASE_SERVICE_ROLE_KEY is the service-role key, not the anon key.',
        })
      default:
        return new OpsError(message, {
          hint: error.hint ?? error.details ?? undefined,
          cause: error,
        })
    }
  }

  if (error instanceof Error) {
    const cause = error.cause as { code?: unknown } | undefined
    if (
      cause &&
      typeof cause === 'object' &&
      ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(
        String(cause.code),
      )
    ) {
      return new OpsError(`${prefix}Network error (${String(cause.code)})`, {
        hint: 'Check NEXT_PUBLIC_SUPABASE_URL and your connection.',
        cause: error,
      })
    }
    return new OpsError(`${prefix}${error.message}`, { cause: error })
  }

  return new OpsError(`${prefix}${String(error)}`)
}

/** Returns `data`, or throws a typed OpsError when a Supabase response carries an error. */
export function unwrap<T>(
  result: { data: T; error: unknown },
  context: string,
): T {
  if (result.error) throw toOpsError(result.error, context)
  return result.data
}

/** Like unwrap() for list queries: a null result becomes an empty array. */
export function unwrapRows<T>(
  result: { data: T[] | null; error: unknown },
  context: string,
): T[] {
  return unwrap(result, context) ?? []
}
