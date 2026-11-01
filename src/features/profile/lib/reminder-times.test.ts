import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMINDER_TIMES,
  formatReminderTime,
  isValidReminderTime,
  normalizeReminderTimes,
  REMINDER_TIME_OPTIONS,
  replaceReminderTime,
  timeToMinutes,
  toReminderTime,
} from './reminder-times'
import { reminderTimesSchema } from '@/validators/profile'

describe('reminder time options', () => {
  it('offers 06:00 to 22:00 in 15-minute steps', () => {
    expect(REMINDER_TIME_OPTIONS[0]).toBe('06:00')
    expect(REMINDER_TIME_OPTIONS.at(-1)).toBe('22:00')
    expect(REMINDER_TIME_OPTIONS).toHaveLength(65)
    expect(REMINDER_TIME_OPTIONS.every(isValidReminderTime)).toBe(true)
  })

  it('mirrors the historical default slots', () => {
    expect(DEFAULT_REMINDER_TIMES).toEqual({
      1: ['09:00'],
      2: ['09:00', '17:00'],
      3: ['09:00', '13:00', '18:00'],
    })
  })
})

describe('reminder time helpers', () => {
  it('normalises database values with seconds and sorts unique times', () => {
    expect(toReminderTime('09:30:00')).toBe('09:30')
    expect(timeToMinutes('13:15:00')).toBe(795)
    expect(normalizeReminderTimes(['18:00:00', '09:00', '09:00:00'])).toEqual([
      '09:00',
      '18:00',
    ])
  })

  it('replaces one reminder and keeps the list ordered', () => {
    expect(replaceReminderTime(['09:00', '17:00'], 1, '07:45')).toEqual([
      '07:45',
      '09:00',
    ])
  })

  it('validates range, step and format', () => {
    for (const valid of ['06:00', '09:15', '22:00', '10:45:00'])
      expect(isValidReminderTime(valid), valid).toBe(true)
    for (const invalid of ['05:45', '22:15', '09:10', '9:00', 'noon'])
      expect(isValidReminderTime(invalid), invalid).toBe(false)
  })

  it('formats per the 12h/24h preference', () => {
    expect(formatReminderTime('06:00', '12h')).toBe('6:00 AM')
    expect(formatReminderTime('12:15:00', '12h')).toBe('12:15 PM')
    expect(formatReminderTime('22:00', undefined)).toBe('10:00 PM')
    expect(formatReminderTime('18:30', '24h')).toBe('18:30')
  })
})

describe('reminderTimesSchema', () => {
  it('accepts one to three distinct valid times', () => {
    expect(reminderTimesSchema.parse(['09:00'])).toEqual(['09:00'])
    expect(
      reminderTimesSchema.safeParse(['07:30', '13:00:00', '20:00']).success,
    ).toBe(true)
  })

  it.each([
    [[]],
    [['09:00', '10:00', '11:00', '12:00']],
    [['05:45']],
    [['09:10']],
    [['09:00', '09:00:00']],
    [['nine']],
  ])('rejects %j', (times) => {
    expect(reminderTimesSchema.safeParse(times).success).toBe(false)
  })
})
