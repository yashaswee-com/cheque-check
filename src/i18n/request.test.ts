import { beforeEach, describe, expect, it, vi } from 'vitest'
import requestConfig from './request'

const mocks = vi.hoisted(() => ({ get: vi.fn(), warn: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get }) }))
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

  it('uses English when no cookie exists', async () => {
    const config = await requestConfig({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe('en')
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('logs and uses English for an unsupported cookie', async () => {
    mocks.get.mockReturnValue({ value: '../../unknown' })
    const config = await requestConfig({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe('en')
    expect(config.messages).toHaveProperty('Common')
    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})
