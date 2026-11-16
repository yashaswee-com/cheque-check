import { beforeEach, describe, expect, it, vi } from 'vitest'
import requestConfig from './request'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  header: vi.fn(),
  warn: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.get }),
  headers: async () => ({ get: mocks.header }),
}))
vi.mock('next-intl/server', () => ({
  getRequestConfig: (callback: unknown) => callback,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }))

beforeEach(() => vi.resetAllMocks())

describe('request locale contract', () => {
  it.each(['en', 'hi', 'hi-en'])(
    'loads a supported catalog: %s',
    async (locale) => {
      mocks.get.mockReturnValue({ value: locale })
      const config = await requestConfig({
        requestLocale: Promise.resolve(undefined),
      })
      expect(config.locale).toBe(locale)
      expect(config.messages).toHaveProperty('Common')
      expect(mocks.warn).not.toHaveBeenCalled()
    },
  )

  it('uses Hinglish when no cookie exists', async () => {
    const config = await requestConfig({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe('hi-en')
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it.each([
    ['hi-IN, en;q=0.8', 'hi'],
    ['fr, en-US;q=0.8, hi;q=0.9', 'hi'],
    ['hi;q=0, en-GB;q=0.5', 'en'],
    ['fr, *;q=0.8', 'hi-en'],
  ])(
    'uses the best supported browser language: %s',
    async (header, expected) => {
      mocks.header.mockReturnValue(header)
      const config = await requestConfig({
        requestLocale: Promise.resolve(undefined),
      })
      expect(config.locale).toBe(expected)
    },
  )

  it('keeps an explicit cookie over the browser preference', async () => {
    mocks.get.mockReturnValue({ value: 'hi-en' })
    mocks.header.mockReturnValue('en')
    const config = await requestConfig({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe('hi-en')
  })
  it('logs and uses Hinglish for an unsupported cookie', async () => {
    mocks.get.mockReturnValue({ value: '../../unknown' })
    const config = await requestConfig({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe('hi-en')
    expect(config.messages).toHaveProperty('Common')
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  it.each(['EN', 'fr', ' hi ', '../en', 'en.json'])(
    'rejects noncanonical locale values without attempting a catalog import: %s',
    async (locale) => {
      mocks.get.mockReturnValue({ value: locale })
      const config = await requestConfig({
        requestLocale: Promise.resolve('hi'),
      })
      expect(config.locale).toBe('hi-en')
      expect(config.messages).toHaveProperty('Common')
      expect(mocks.warn).toHaveBeenCalledWith(
        'Unsupported locale cookie; using Hinglish',
      )
    },
  )

  it('treats an empty cookie as the default rather than an invalid locale', async () => {
    mocks.get.mockReturnValue({ value: '' })
    const config = await requestConfig({
      requestLocale: Promise.resolve('hi'),
    })
    expect(config.locale).toBe('hi-en')
    expect(mocks.get).toHaveBeenCalledWith('NEXT_LOCALE')
    expect(mocks.warn).not.toHaveBeenCalled()
  })
})
