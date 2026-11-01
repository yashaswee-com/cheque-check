import { localDay } from '@/lib/preference-format'

export const DUE_DATE_PRESETS = [0, 7, 14, 30, 60, 90, 'monthEnd'] as const
export type DueDatePreset = (typeof DUE_DATE_PRESETS)[number]

export function dueDateForPreset(
  preset: DueDatePreset,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const [year, month, day] = localDay(now, timeZone).split('-').map(Number)
  const result =
    preset === 'monthEnd'
      ? new Date(Date.UTC(year, month, 0))
      : new Date(Date.UTC(year, month - 1, day + preset))
  return localDay(result, 'UTC')
}
