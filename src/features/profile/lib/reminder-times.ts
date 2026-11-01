export const REMINDER_TIME_STEP_MINUTES = 15
export const EARLIEST_REMINDER_MINUTES = 6 * 60
export const LATEST_REMINDER_MINUTES = 22 * 60
export const MAX_REMINDER_TIMES = 3

/** Historical fixed slots per reminders_per_day; mirrors reminder_times_for_count(NULL, n). */
export const DEFAULT_REMINDER_TIMES: Record<number, string[]> = {
  1: ['09:00'],
  2: ['09:00', '17:00'],
  3: ['09:00', '13:00', '18:00'],
}

const pad = (value: number) => String(value).padStart(2, '0')

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** Accepts HH:MM or HH:MM:SS (PostgREST returns seconds) and returns HH:MM. */
export function toReminderTime(value: string): string {
  return value.slice(0, 5)
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = toReminderTime(value).split(':').map(Number)
  return hours * 60 + minutes
}

/** Every selectable time: 06:00 to 22:00 in 15-minute steps. */
export const REMINDER_TIME_OPTIONS: string[] = Array.from(
  {
    length:
      (LATEST_REMINDER_MINUTES - EARLIEST_REMINDER_MINUTES) /
        REMINDER_TIME_STEP_MINUTES +
      1,
  },
  (_, index) =>
    minutesToTime(
      EARLIEST_REMINDER_MINUTES + index * REMINDER_TIME_STEP_MINUTES,
    ),
)

export function isValidReminderTime(value: string): boolean {
  if (!/^\d{2}:\d{2}(:00)?$/.test(value)) return false
  const minutes = timeToMinutes(value)
  return (
    minutes >= EARLIEST_REMINDER_MINUTES &&
    minutes <= LATEST_REMINDER_MINUTES &&
    minutes % REMINDER_TIME_STEP_MINUTES === 0
  )
}

/** Sorted, de-duplicated HH:MM list, as the database stores it. */
export function normalizeReminderTimes(times: readonly string[]): string[] {
  return [...new Set(times.map(toReminderTime))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b),
  )
}

export function replaceReminderTime(
  times: readonly string[],
  index: number,
  value: string,
): string[] {
  const next = times.map(toReminderTime)
  next[index] = toReminderTime(value)
  return normalizeReminderTimes(next)
}

export function formatReminderTime(
  value: string,
  timeFormat: string | null | undefined,
): string {
  const time = toReminderTime(value)
  if (timeFormat === '24h') return time
  const minutes = timeToMinutes(time)
  const hours = Math.floor(minutes / 60)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${pad(minutes % 60)} ${suffix}`
}
