import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAuthRepository } from './auth.repository'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  auth: {
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}))

const supabase = { auth: mocks.auth }

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SupabaseAuthRepository', () => {
  it('passes CAPTCHA tokens in Supabase Auth options for all email flows', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const repository = new SupabaseAuthRepository()
    await repository.loginWithPassword(
      'person@example.test',
      'password',
      'login-token',
    )
    await repository.signupWithPassword(
      'person@example.test',
      'password',
      'Test Person',
      'signup-token',
    )
    await repository.resetPassword(
      'person@example.test',
      'https://app.test/reset',
      'reset-token',
    )
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'password',
      options: { captchaToken: 'login-token' },
    })
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'password',
      options: { data: { name: 'Test Person' }, captchaToken: 'signup-token' },
    })
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.test',
      { redirectTo: 'https://app.test/reset', captchaToken: 'reset-token' },
    )
  })

  it('forwards password, signup, OAuth, and logout requests to Supabase', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const repository = new SupabaseAuthRepository()
    const callback = vi.fn()

    await repository.loginWithPassword('person@example.com', 'secret')
    await repository.signupWithPassword(
      'person@example.com',
      'secret',
      'Person Name',
    )
    await repository.loginWithOAuth('google', 'https://app.test/callback')
    await repository.signOut()

    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'secret',
    })
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'secret',
      options: { data: { name: 'Person Name' } },
    })
    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.test/callback' },
    })
    expect(mocks.auth.signOut).toHaveBeenCalledOnce()

    repository.onAuthStateChange(callback)
    expect(mocks.auth.onAuthStateChange).toHaveBeenCalledWith(callback)
  })

  it('forwards password reset and session/user queries', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const repository = new SupabaseAuthRepository()

    await repository.resetPassword(
      'person@example.com',
      'https://app.test/reset',
    )
    await repository.getSession()
    await repository.getUser()

    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.com',
      { redirectTo: 'https://app.test/reset' },
    )
    expect(mocks.auth.getSession).toHaveBeenCalledOnce()
    expect(mocks.auth.getUser).toHaveBeenCalledOnce()
  })

  it('posts phone OTP requests to the matching API endpoint', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        ok: true,
        phone: '+919876543210',
        resendAfterSeconds: 30,
      }),
    } as Response)
    const repository = new SupabaseAuthRepository()
    const input = {
      phone: '9876543210',
      purpose: 'login' as const,
      captchaToken: 'captcha',
    }

    await expect(repository.sendPhoneOtp(input)).resolves.toEqual({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 30,
    })
    expect(fetch).toHaveBeenCalledWith('/api/auth/phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  })

  it('posts phone verification requests to the verify endpoint', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        ok: true,
        phone: '+919876543210',
        purpose: 'login',
      }),
    } as Response)
    const repository = new SupabaseAuthRepository()
    const input = {
      phone: '9876543210',
      token: '123456',
      purpose: 'login' as const,
    }

    await expect(repository.verifyPhoneOtp(input)).resolves.toMatchObject({
      ok: true,
      phone: '+919876543210',
    })
    expect(fetch).toHaveBeenCalledWith('/api/auth/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  })

  it('returns provider-unavailable for network, JSON, or response-shape failures', async () => {
    mocks.createClient.mockReturnValue(supabase)
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ json: async () => null } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ error: 'bad response' }),
      } as Response)
    const repository = new SupabaseAuthRepository()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        repository.sendPhoneOtp({ phone: '9876543210', purpose: 'login' }),
      ).resolves.toEqual({
        ok: false,
        status: 503,
        code: 'provider_unavailable',
      })
    }
  })
})
