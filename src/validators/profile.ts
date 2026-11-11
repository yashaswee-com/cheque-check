import { z } from 'zod'

export const localeSchema = z.enum(['en', 'hi', 'hi-en'])
export const currencySchema = z.enum(['₹', '$', '€', '£'])
export const dateFormatSchema = z.enum([
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
])
export const timeFormatSchema = z.enum(['12h', '24h'])
export const appearanceSchema = z.enum(['light', 'dark', 'system'])
export const tourStatusSchema = z.enum(['pending', 'completed', 'skipped'])

export function isValidTimeZone(zone: string) {
  if (!zone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}
/** Mirrors profile_time_zone_valid: a non-empty IANA time zone name. */
export const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, 'Choose a supported time zone')

/** Mirrors profile_reminder_times_valid: 1-3 distinct 15-minute times, 06:00-22:00. */
export const reminderTimesSchema = z
  .array(z.string().regex(/^\d{2}:\d{2}(:00)?$/))
  .min(1)
  .max(3)
  .refine(
    (times) =>
      times.every((time) => {
        const [hours, minutes] = time.split(':').map(Number)
        const total = hours * 60 + minutes
        return total >= 360 && total <= 1320 && minutes % 15 === 0
      }),
    'Choose reminder times between 06:00 and 22:00 in 15-minute steps',
  )
  .refine(
    (times) =>
      new Set(times.map((time) => time.slice(0, 5))).size === times.length,
    'Reminder times must be different',
  )

export const closedProfileChoices = z
  .object({
    ai_scan_enabled: z.boolean(),
    privacy_cover: z.boolean(),
    currency: currencySchema,
    date_format: dateFormatSchema,
    time_format: timeFormatSchema,
    language: localeSchema,
    appearance: appearanceSchema,
    tour_status: tourStatusSchema,
    time_zone: timeZoneSchema,
  })
  .partial()
