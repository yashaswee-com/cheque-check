import { describe, expect, it } from 'vitest'
import {
  createPreferenceFormatter,
  formattingLocale,
} from './preference-format'
import { numberToIndianWords } from './utils'

describe('preference formatting', () => {
  it.each([
    ['dd/MM/yyyy', '31/10/2026'],
    ['MM/dd/yyyy', '10/31/2026'],
    ['yyyy-MM-dd', '2026-10-31'],
  ])(
    'uses %s without shifting calendar dates in any supported time zone',
    (date_format, expected) => {
      for (const time_zone of [
        'Asia/Kolkata',
        'UTC',
        'America/New_York',
        'Europe/London',
      ]) {
        expect(
          createPreferenceFormatter({ date_format, time_zone }).date(
            '2026-10-31',
          ),
        ).toBe(expected)
      }
    },
  )

  it('converts timestamp dates and times using the selected zone, not the browser zone', () => {
    const instant = '2026-10-31T22:45:00Z'
    const india = createPreferenceFormatter({
      time_zone: 'Asia/Kolkata',
      time_format: '24h',
    })
    const newYork = createPreferenceFormatter({
      time_zone: 'America/New_York',
      time_format: '24h',
    })
    expect(india.dateTime(instant)).toBe('01/11/2026, 04:15')
    expect(newYork.dateTime(instant)).toBe('31/10/2026, 18:45')
  })

  it('uses 12-hour periods and 24-hour midnight without displaying 24:00', () => {
    const midnight = '2026-11-01T00:00:00Z'
    const twelve = createPreferenceFormatter({
      time_zone: 'UTC',
      time_format: '12h',
    })
    expect(twelve.time(midnight)).toMatch(/^12:00\s(am|AM)$/)
    expect(twelve.time('2026-11-01T13:05:00Z')).toMatch(/^01:05\s(pm|PM)$/)
    expect(
      createPreferenceFormatter({ time_zone: 'UTC', time_format: '24h' }).time(
        midnight,
      ),
    ).toBe('00:00')
  })

  it('handles DST transitions with the named time zone', () => {
    const format = createPreferenceFormatter({
      time_zone: 'America/New_York',
      time_format: '24h',
    })
    expect(format.time('2026-03-08T06:30:00Z')).toBe('01:30')
    expect(format.time('2026-03-08T07:30:00Z')).toBe('03:30')
    expect(format.time('2026-11-01T05:30:00Z')).toBe('01:30')
    expect(format.time('2026-11-01T06:30:00Z')).toBe('01:30')
  })

  it.each(['₹', '$', '€', '£'])(
    'uses the selected %s symbol without exchanging the amount',
    (currency) => {
      const format = createPreferenceFormatter({ currency })
      expect(format.currency(12500.5)).toBe(`${currency}12,500.5`)
      expect(format.currency(-12500.5)).toBe(`-${currency}12,500.5`)
      expect(format.currency(0)).toBe(`${currency}0`)
      expect(
        format.currency(25, currency, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      ).toBe(`${currency}25.00`)
      expect(format.currency(50, '₹')).toBe('₹50')
    },
  )

  it.each(['en', 'hi', 'hi-en'])(
    'uses a valid Intl locale for %s',
    (language) => {
      const format = createPreferenceFormatter({ language })
      expect(format.number(1234567.5)).toBe(
        new Intl.NumberFormat(formattingLocale(language)).format(1234567.5),
      )
      expect(format.time('2026-10-31T12:00:00Z')).not.toBe('')
    },
  )

  it('keeps calendar selections and month-only policy dates at their original precision', () => {
    const format = createPreferenceFormatter({
      time_zone: 'America/New_York',
      date_format: 'yyyy-MM-dd',
    })
    expect(format.calendarDate(new Date(2026, 9, 31))).toBe('2026-10-31')
    expect(format.month('2026-08')).toBe('2026-08')
    expect(createPreferenceFormatter().month('2026-08')).toBe('08/2026')
  })

  it('surfaces invalid dates and time zones instead of displaying misleading values', () => {
    expect(() => createPreferenceFormatter().date('invalid')).toThrow(
      RangeError,
    )
    expect(() =>
      createPreferenceFormatter({ time_zone: 'invalid' }).time(new Date()),
    ).toThrow(RangeError)
  })

  it('localizes amount words and the chosen currency in Hindi', () => {
    expect(numberToIndianWords(12521, '₹', 'hi')).toBe(
      'बारह हज़ार पाँच सौ इक्कीस रुपये मात्र',
    )
    expect(numberToIndianWords(0, '$', 'hi')).toBe('शून्य डॉलर मात्र')
    expect(numberToIndianWords(10000000, '€', 'hi')).toBe('एक करोड़ यूरो मात्र')
    expect(numberToIndianWords(1000, '£')).toBe('One Thousand Pounds Only')
  })
})
