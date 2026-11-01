export abstract class AppError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(message: string, code: string, cause?: unknown) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.cause = cause
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'NOT_FOUND', cause)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFLICT', cause)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DATABASE_ERROR', cause)
  }
}

/** A free-plan cap enforced by the database (SQLSTATE 53400). */
export class PlanLimitError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PLAN_LIMIT', cause)
  }
}

export function mapSupabaseError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (!error || typeof error !== 'object') {
    return new DatabaseError('Unknown database error')
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined
  const message =
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
      ? error.message
      : 'Database request failed'

  if (code === '23505') {
    return new ConflictError(message, error)
  }

  if (
    code === 'PGRST116' ||
    ('details' in error &&
      typeof error.details === 'string' &&
      error.details.includes('0 rows'))
  ) {
    return new NotFoundError(message, error)
  }

  if (code === '42501') {
    return new ValidationError(message, error)
  }

  if (code === '53400') {
    return new PlanLimitError(message, error)
  }

  return new DatabaseError(message, error)
}
