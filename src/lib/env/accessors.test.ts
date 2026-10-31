import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { getOpenAiEnv, getRazorpayEnv, getSupabaseAdminEnv } from './server'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('server environment accessors', () => {
  it('reads provider credentials only from their validated variables', () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-openai-key')
    vi.stubEnv('RAZORPAY_KEY_ID', 'synthetic-razorpay-id')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'synthetic-razorpay-secret')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-role')
    expect(getOpenAiEnv()).toEqual({ OPENAI_API_KEY: 'synthetic-openai-key' })
    expect(getRazorpayEnv()).toEqual({
      RAZORPAY_KEY_ID: 'synthetic-razorpay-id',
      RAZORPAY_KEY_SECRET: 'synthetic-razorpay-secret',
    })
    expect(getSupabaseAdminEnv()).toEqual({
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
    })
  })

  it.each([
    { key: 'OPENAI_API_KEY', read: getOpenAiEnv, scope: 'OpenAI' },
    { key: 'RAZORPAY_KEY_ID', read: getRazorpayEnv, scope: 'Razorpay' },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      read: getSupabaseAdminEnv,
      scope: 'Supabase admin',
    },
  ])(
    'fails explicitly for missing $scope configuration',
    ({ key, read, scope }) => {
      vi.stubEnv(key, '')
      expect(read).toThrow(`Invalid ${scope} environment variables`)
    },
  )
})

describe('public environment accessors', () => {
  it('rejects invalid required configuration during module initialization', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-url')
    await expect(import('./client')).rejects.toThrow(
      'Invalid public environment variables',
    )
  })

  it('requires a configured public payment key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', '')
    const { getRazorpayPublicKey } = await import('./client')
    expect(getRazorpayPublicKey).toThrow(
      'NEXT_PUBLIC_RAZORPAY_KEY_ID is required',
    )
  })

  it('returns the validated public payment key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'synthetic-public-key')
    const { getRazorpayPublicKey, publicEnv } = await import('./client')
    expect(getRazorpayPublicKey()).toBe('synthetic-public-key')
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe(
      'https://example.supabase.co',
    )
  })
})
