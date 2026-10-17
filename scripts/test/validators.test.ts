// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from '../lib/csv'
import { UsageError } from '../lib/errors'
import {
  parseBoolean,
  parseChoice,
  parseDate,
  parseEmail,
  parseFutureDate,
  parseInteger,
  parsePhone,
  parseTimeZone,
  parseUuid,
  promptValidator,
} from '../lib/validators'

describe('validators', () => {
  it('normalises valid input', () => {
    expect(parseEmail('  Priya@Example.COM ')).toBe('priya@example.com')
    expect(parseUuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    )
    expect(parsePhone('98765 43210')).toBe('+919876543210')
    expect(parseTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(parseBoolean('on', 'Voice')).toBe(true)
    expect(parseChoice('ai', ['voice', 'ai'] as const, 'Kind')).toBe('ai')
    expect(parseDate('2030-01-31')).toBe('2030-01-31T23:59:59.999Z')
  })

  it('rejects invalid input with usage errors', () => {
    expect(() => parseEmail('nope')).toThrow(UsageError)
    expect(() => parseUuid('123')).toThrow(UsageError)
    expect(() => parsePhone('12')).toThrow(UsageError)
    expect(() => parseTimeZone('Mars/Base')).toThrow(UsageError)
    expect(() => parseBoolean('maybe', 'Voice')).toThrow(UsageError)
    expect(() => parseDate('soon')).toThrow(UsageError)
  })

  it('enforces integer ranges', () => {
    expect(parseInteger('42', 'Amount', { min: 1 })).toBe(42)
    expect(() => parseInteger('1.5', 'Amount')).toThrow('whole number')
    expect(() => parseInteger('0', 'Amount', { min: 1 })).toThrow('at least 1')
    expect(() => parseInteger('11', 'Amount', { max: 10 })).toThrow(
      'at most 10',
    )
  })

  it('requires future dates relative to now', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(() => parseFutureDate('2029-12-31', 'Expiry', now)).toThrow(
      'in the future',
    )
    expect(parseFutureDate('2030-01-02', 'Expiry', now)).toBe(
      '2030-01-02T23:59:59.999Z',
    )
  })

  it('adapts parsers into prompt validators', () => {
    const validate = promptValidator((value) => parseInteger(value, 'Amount'))
    expect(validate('3')).toBe(true)
    expect(validate('x')).toBe('Amount must be a whole number.')
  })
})

describe('csv', () => {
  it('parses quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    const text =
      '\uFEFFEmail,Reason\r\na@x.com,"Support, #1"\r\n\r\nb@x.com,"He said ""hi"""\n'
    expect(parseCsv(text)).toEqual([
      { email: 'a@x.com', reason: 'Support, #1' },
      { email: 'b@x.com', reason: 'He said "hi"' },
    ])
  })

  it('rejects empty files and unterminated quotes', () => {
    expect(() => parseCsv('\n\n')).toThrow('empty')
    expect(() => parseCsv('a\n"oops')).toThrow('unterminated')
  })

  it('round-trips through toCsv', () => {
    const rows = [{ email: 'a@x.com', reason: 'x, "y"' }]
    expect(parseCsv(toCsv(rows, ['email', 'reason']))).toEqual(rows)
  })
})
