import type { Profile } from '@/types'

export type FormattingPreferences = Partial<
  Pick<
    Profile,
    'currency' | 'date_format' | 'time_format' | 'time_zone' | 'language'
  >
>

export function formattingLocale(language: string): string {
  if (language === 'hi-en') return 'en-IN'
  if (language === 'hi') return 'hi-IN'
  if (language === 'en') return 'en-IN'
  return language
}

export function localDay(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function calendarDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseCalendarDate(
  value: string,
  pattern: string,
): string | null {
  const text = value.trim()
  const isoInput = /^\d{4}-\d{2}-\d{2}$/.test(text)
  const format = isoInput ? 'yyyy-MM-dd' : pattern
  const tokens = format.split(/[-/]/)
  const values = text.split(/[-/]/)
  if (
    values.length !== 3 ||
    !tokens.every((token, index) =>
      new RegExp(`^\\d{${token.length}}$`).test(values[index]),
    )
  )
    return null
  const year = values[tokens.indexOf('yyyy')]
  const month = values[tokens.indexOf('MM')]
  const day = values[tokens.indexOf('dd')]
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || localDay(parsed, 'UTC') !== iso)
    return null
  return iso
}
export function createPreferenceFormatter(
  preferences: FormattingPreferences | null = null,
  language = preferences?.language || 'en',
) {
  const locale = formattingLocale(language)
  const dateFormat = preferences?.date_format || 'dd/MM/yyyy'
  const timeZone = preferences?.time_zone || 'Asia/Kolkata'
  const number = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options).format(value)
  const currency = (
    value: number,
    symbol = preferences?.currency || '₹',
    options?: Intl.NumberFormatOptions,
  ) => `${value < 0 ? '-' : ''}${symbol}${number(Math.abs(value), options)}`

  function date(value: string | Date): string {
    // Cheque and policy dates are calendar dates, not instants in a time zone.
    const calendarDate =
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    const parsed = calendarDate
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value)
    const [year, month, day] = localDay(
      parsed,
      calendarDate ? 'UTC' : timeZone,
    ).split('-')
    return dateFormat
      .replace(/yyyy|YYYY/g, year)
      .replace(/MM/g, month)
      .replace(/dd|DD/g, day)
  }

  const time = (value: string | Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: preferences?.time_format === '24h' ? 'h23' : 'h12',
      timeZone,
    }).format(new Date(value))

  return {
    locale,
    dateFormat,
    timeZone,
    number,
    currency,
    date,
    time,
    dateTime: (value: string | Date) => `${date(value)}, ${time(value)}`,
    today: () => localDay(new Date(), timeZone),
    calendarDate: (value: Date) => date(calendarDay(value)),
    month: (value: string) => {
      const [year, month] = value.split('-')
      return dateFormat.startsWith('yyyy')
        ? `${year}-${month}`
        : `${month}/${year}`
    },
  }
}
