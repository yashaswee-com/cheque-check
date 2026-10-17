import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { z } from 'zod'
import { UsageError } from './errors'

export type Parser<T> = (value: string) => T

/** Adapts a throwing parser into an @inquirer `validate` callback. */
export function promptValidator<T>(parse: Parser<T>) {
  return (value: string): true | string => {
    try {
      parse(value)
      return true
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

// guid(): any 8-4-4-4-12 hex id (seed data uses non-RFC ids).
const uuidSchema = z.guid()
const emailSchema = z.email()

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value.trim()).success
}

export function isEmail(value: string): boolean {
  return emailSchema.safeParse(value.trim()).success
}

export function parseUuid(value: string, label = 'ID'): string {
  const trimmed = value.trim()
  if (!isUuid(trimmed)) throw new UsageError(`${label} must be a UUID.`)
  return trimmed.toLowerCase()
}

export function parseEmail(value: string, label = 'Email'): string {
  const trimmed = value.trim().toLowerCase()
  if (!isEmail(trimmed)) {
    throw new UsageError(`${label} must be a valid email address.`)
  }
  return trimmed
}

/** Normalises to E.164. Numbers without a country code are read as Indian. */
export function parsePhone(value: string, label = 'Phone'): string {
  const phone = parsePhoneNumberFromString(value.trim(), 'IN')
  if (!phone?.isValid()) {
    throw new UsageError(
      `${label} must be a valid phone number (E.164, e.g. +919876543210).`,
    )
  }
  return phone.number
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function parseTimeZone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || !isValidTimeZone(trimmed)) {
    throw new UsageError(
      `Unknown time zone "${value}".`,
      'Use an IANA name such as Asia/Kolkata.',
    )
  }
  return trimmed
}

export function parseInteger(
  value: string | number,
  label: string,
  range: { min?: number; max?: number } = {},
): number {
  const text = String(value).trim()
  const number = Number(text)
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(number)) {
    throw new UsageError(`${label} must be a whole number.`)
  }
  if (range.min !== undefined && number < range.min) {
    throw new UsageError(`${label} must be at least ${range.min}.`)
  }
  if (range.max !== undefined && number > range.max) {
    throw new UsageError(`${label} must be at most ${range.max}.`)
  }
  return number
}

export const LANGUAGES = ['en', 'hi', 'hi-en'] as const
export type Language = (typeof LANGUAGES)[number]

export function parseLanguage(value: string): Language {
  const trimmed = value.trim().toLowerCase()
  if ((LANGUAGES as readonly string[]).includes(trimmed)) {
    return trimmed as Language
  }
  throw new UsageError(`Language must be one of: ${LANGUAGES.join(', ')}.`)
}

export function parseBoolean(value: string, label: string): boolean {
  const normalised = value.trim().toLowerCase()
  if (['true', 'yes', 'y', 'on', '1'].includes(normalised)) return true
  if (['false', 'no', 'n', 'off', '0'].includes(normalised)) return false
  throw new UsageError(`${label} must be true or false.`)
}

/**
 * Accepts `YYYY-MM-DD` (end of that day, UTC) or a full ISO timestamp.
 * Returns an ISO string.
 */
export function parseDate(value: string, label = 'Date'): string {
  const trimmed = value.trim()
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const date = new Date(dateOnly ? `${trimmed}T23:59:59.999Z` : trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new UsageError(
      `${label} must be a date (YYYY-MM-DD) or ISO timestamp.`,
    )
  }
  return date.toISOString()
}

export function parseFutureDate(
  value: string,
  label = 'Date',
  now = Date.now(),
): string {
  const iso = parseDate(value, label)
  if (Date.parse(iso) <= now) {
    throw new UsageError(`${label} must be in the future.`)
  }
  return iso
}

export function parseChoice<T extends string>(
  value: string,
  choices: readonly T[],
  label: string,
): T {
  const trimmed = value.trim()
  if ((choices as readonly string[]).includes(trimmed)) return trimmed as T
  throw new UsageError(`${label} must be one of: ${choices.join(', ')}.`)
}
