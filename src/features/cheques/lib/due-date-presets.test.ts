import { describe, expect, it } from 'vitest'
import { DUE_DATE_PRESETS, dueDateForPreset } from './due-date-presets'

describe('due date presets', () => {
  it('provides every requested offset, anchored to the profile day', () => {
    const now = new Date('2026-01-31T23:30:00Z')
    expect(
      DUE_DATE_PRESETS.map((preset) =>
        dueDateForPreset(preset, now, 'Asia/Kolkata'),
      ),
    ).toEqual([
      '2026-02-01',
      '2026-02-08',
      '2026-02-15',
      '2026-03-03',
      '2026-04-02',
      '2026-05-02',
      '2026-02-28',
    ])
  })
  it('handles leap years, year rollover and DST as calendar arithmetic', () => {
    expect(
      dueDateForPreset('monthEnd', new Date('2024-02-10T12:00:00Z'), 'UTC'),
    ).toBe('2024-02-29')
    expect(dueDateForPreset(7, new Date('2026-12-31T12:00:00Z'), 'UTC')).toBe(
      '2027-01-07',
    )
    expect(
      dueDateForPreset(7, new Date('2026-03-07T20:00:00Z'), 'America/New_York'),
    ).toBe('2026-03-14')
  })
})
