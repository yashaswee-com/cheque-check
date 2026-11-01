import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns'
import { localDay } from '@/lib/preference-format'

export const DATE_RANGE_PRESETS = [
  'all',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
] as const

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]

/** Inclusive `yyyy-MM-dd` bounds; a missing side is unbounded. */
export interface ChequeDateRange {
  from?: string
  to?: string
}

const toDay = (date: Date) => format(date, 'yyyy-MM-dd')

export function resolveDateRange(
  preset: DateRangePreset,
  now: Date = new Date(),
  custom: { from?: Date; to?: Date } = {},
  timeZone?: string,
): ChequeDateRange {
  const calendarNow = timeZone
    ? new Date(`${localDay(now, timeZone)}T12:00:00`)
    : now
  switch (preset) {
    case 'thisWeek':
      return {
        from: toDay(startOfWeek(calendarNow, { weekStartsOn: 1 })),
        to: toDay(endOfWeek(calendarNow, { weekStartsOn: 1 })),
      }
    case 'thisMonth':
      return {
        from: toDay(startOfMonth(calendarNow)),
        to: toDay(endOfMonth(calendarNow)),
      }
    case 'lastMonth': {
      const lastMonth = subMonths(calendarNow, 1)
      return {
        from: toDay(startOfMonth(lastMonth)),
        to: toDay(endOfMonth(lastMonth)),
      }
    }
    case 'thisYear':
      return {
        from: toDay(startOfYear(calendarNow)),
        to: toDay(endOfYear(calendarNow)),
      }
    case 'custom':
      return {
        from: custom.from ? toDay(custom.from) : undefined,
        to: custom.to
          ? toDay(custom.to)
          : custom.from
            ? toDay(custom.from)
            : undefined,
      }
    case 'all':
      return {}
  }
}

export function filterByChequeDate<T extends { cheque_date: string | null }>(
  cheques: T[] | undefined,
  { from, to }: ChequeDateRange,
): T[] | undefined {
  if (!cheques || (!from && !to)) return cheques
  return cheques.filter((c) => {
    if (!c.cheque_date) return false
    if (from && c.cheque_date < from) return false
    if (to && c.cheque_date > to) return false
    return true
  })
}
