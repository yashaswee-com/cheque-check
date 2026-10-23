import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapPhoneAuthError, sendPhoneOtp, verifyPhoneOtp } from './phone-auth'
import { deactivateAccount } from './deactivate-account'

function makeClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'u1', phone: '' } },
      error: null,
    }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...((overrides.auth as object) ?? {}),
  }
  const profile = overrides.profile ?? { deleted_at: null }
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
  }
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  const client = { auth, from: vi.fn(() => query), rpc }
  return { client: client as unknown as SupabaseClient, auth, rpc }
}

describe('sendPhoneOtp', () => {
  it('rejects non-Indian numbers before calling Supabase', async () => {
    const { client, auth } = makeClient()
    const result = await sendPhoneOtp(client, {
      phone: '+14155550123',
      purpose: 'login',
    })
    expect(result).toMatchObject({ ok: false, code: 'unsupported_country' })
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies', async () => {
    const { client } = makeClient()
    expect(await sendPhoneOtp(client, { purpose: 'x' })).toMatchObject({
      code: 'invalid_request',
    })
  })

  it('sends login OTP in E.164 with captcha token', async () => {
    const { client, auth } = makeClient()
    const result = await sendPhoneOtp(client, {
      phone: '98765 43210',
      purpose: 'login',
      captchaToken: 'tok',
    })
    expect(result).toMatchObject({ ok: true, phone: '+919876543210' })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      options: { channel: 'sms', shouldCreateUser: false, captchaToken: 'tok' },
    })
  })

  it('stores a validated signup name in Supabase Auth metadata', async () => {
    const { client, auth } = makeClient()
    const result = await sendPhoneOtp(client, {
      phone: '98765 43210',
      purpose: 'signup',
      name: '  Asha Rao  ',
    })
    expect(result).toMatchObject({ ok: true })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        captchaToken: undefined,
        data: { name: 'Asha Rao' },
      },
    })
  })

  it('rejects an explicitly blank signup name before contacting Auth', async () => {
    const { client, auth } = makeClient()
    expect(
      await sendPhoneOtp(client, {
        phone: '98765 43210',
        purpose: 'signup',
        name: '   ',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_request' })
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('requires a name for phone signup and does not allow login to create users', async () => {
    const { client, auth } = makeClient()
    expect(
      await sendPhoneOtp(client, {
        phone: '9876543210',
        purpose: 'signup',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_request' })
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('link send requires a session', async () => {
    const { client } = makeClient({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    })
    expect(
      await sendPhoneOtp(client, { phone: '9876543210', purpose: 'link' }),
    ).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  it('link send is rate limited and updates the signed-in user only', async () => {
    const limited = makeClient()
    limited.rpc.mockResolvedValue({ data: false, error: null })
    expect(
      await sendPhoneOtp(limited.client, {
        phone: '9876543210',
        purpose: 'link',
      }),
    ).toMatchObject({ ok: false, code: 'rate_limited', status: 429 })
    expect(limited.auth.updateUser).not.toHaveBeenCalled()

    const ok = makeClient()
    const result = await sendPhoneOtp(ok.client, {
      phone: '9876543210',
      purpose: 'link',
    })
    expect(result).toMatchObject({ ok: true })
    expect(ok.auth.updateUser).toHaveBeenCalledWith({ phone: '+919876543210' })
  })

  it('rejects linking an already verified number', async () => {
    const { client } = makeClient({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'u1',
              phone: '919876543210',
              phone_confirmed_at: '2026-01-01',
            },
          },
          error: null,
        }),
      },
    })
    expect(
      await sendPhoneOtp(client, { phone: '9876543210', purpose: 'link' }),
    ).toMatchObject({ ok: false, code: 'already_linked' })
  })

  it('blocks deactivated profiles from linking', async () => {
    const { client } = makeClient({ profile: { deleted_at: 'x' } })
    expect(
      await sendPhoneOtp(client, { phone: '9876543210', purpose: 'link' }),
    ).toMatchObject({ ok: false, code: 'account_deactivated' })
  })

  it('maps provider failures without leaking text', async () => {
    const { client } = makeClient({
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({
          error: {
            code: 'sms_send_failed',
            status: 500,
            message: 'Twilio 21608',
          },
        }),
      },
    })
    const result = await sendPhoneOtp(client, {
      phone: '9876543210',
      purpose: 'login',
    })
    expect(result).toEqual({
      ok: false,
      status: 503,
      code: 'provider_unavailable',
    })
  })
})

describe('verifyPhoneOtp', () => {
  it('rejects bad codes locally', async () => {
    const { client, auth } = makeClient()
    expect(
      await verifyPhoneOtp(client, {
        phone: '9876543210',
        token: '12',
        purpose: 'login',
      }),
    ).toMatchObject({ code: 'invalid_or_expired_code' })
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies login with sms type and E.164', async () => {
    const { client, auth } = makeClient()
    const result = await verifyPhoneOtp(client, {
      phone: '9876543210',
      token: '123 456',
      purpose: 'login',
    })
    expect(result).toEqual({
      ok: true,
      phone: '+919876543210',
      purpose: 'login',
    })
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      type: 'sms',
    })
  })

  it('verifies signup codes through Supabase SMS OTP', async () => {
    const { client, auth } = makeClient()
    const result = await verifyPhoneOtp(client, {
      phone: '9876543210',
      token: '123456',
      purpose: 'signup',
    })
    expect(result).toMatchObject({ ok: true, purpose: 'signup' })
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      type: 'sms',
    })
  })

  it('verifies link with phone_change type', async () => {
    const { client, auth } = makeClient()
    await verifyPhoneOtp(client, {
      phone: '9876543210',
      token: '123456',
      purpose: 'link',
    })
    expect(auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'phone_change' }),
    )
  })

  it('maps expired codes', async () => {
    const { client } = makeClient({
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({
          data: {},
          error: { code: 'otp_expired', status: 403 },
        }),
      },
    })
    expect(
      await verifyPhoneOtp(client, {
        phone: '9876543210',
        token: '123456',
        purpose: 'login',
      }),
    ).toMatchObject({ code: 'invalid_or_expired_code' })
  })

  it('signs out and refuses deactivated profiles', async () => {
    const { client, auth } = makeClient({ profile: { deleted_at: 'x' } })
    const result = await verifyPhoneOtp(client, {
      phone: '9876543210',
      token: '123456',
      purpose: 'login',
    })
    expect(result).toMatchObject({ ok: false, code: 'account_deactivated' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does not merge when link verification returns another user', async () => {
    const { client, auth } = makeClient({
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({
          data: { user: { id: 'other' }, session: {} },
          error: null,
        }),
      },
    })
    const result = await verifyPhoneOtp(client, {
      phone: '9876543210',
      token: '123456',
      purpose: 'link',
    })
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(auth.signOut).toHaveBeenCalled()
  })
})

describe('mapPhoneAuthError', () => {
  it.each([
    [{ code: 'over_sms_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ code: 'captcha_failed', status: 400 }, 'captcha_failed'],
    [{ code: 'phone_exists', status: 422 }, 'phone_in_use'],
    [{ code: 'user_banned', status: 400 }, 'account_deactivated'],
    [{ status: 429 }, 'rate_limited'],
    [{}, 'provider_unavailable'],
    [{ status: 400 }, 'unknown'],
  ])('%j -> %s', (input, code) => {
    expect(mapPhoneAuthError(input).code).toBe(code)
  })
})

describe('deactivateAccount', () => {
  it('runs the lifecycle RPC before the ban and global sign-out', async () => {
    const order: string[] = []
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        signOut: vi.fn(async () => {
          order.push('signOut')
          return { error: null }
        }),
      },
      rpc: vi.fn(async () => {
        order.push('rpc')
        return { error: null }
      }),
    } as unknown as SupabaseClient
    const admin = {
      auth: {
        admin: {
          updateUserById: vi.fn(async () => {
            order.push('ban')
            return { error: null }
          }),
        },
      },
    }
    const result = await deactivateAccount(supabase, admin)
    expect(result).toEqual({ ok: true, providerCleanup: true })
    expect(order).toEqual(['rpc', 'ban', 'signOut'])
  })

  it('does not touch the provider when the RPC fails', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        signOut: vi.fn(),
      },
      rpc: vi.fn().mockResolvedValue({ error: { message: 'x' } }),
    } as unknown as SupabaseClient
    const updateUserById = vi.fn()
    const result = await deactivateAccount(supabase, {
      auth: { admin: { updateUserById } },
    })
    expect(result).toEqual({ ok: false, status: 500 })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('reports incomplete provider cleanup after the database barrier is active', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        signOut,
      },
      rpc: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as SupabaseClient
    const result = await deactivateAccount(supabase, {
      auth: {
        admin: {
          updateUserById: vi
            .fn()
            .mockResolvedValue({ error: { message: 'provider unavailable' } }),
        },
      },
    })

    expect(result).toEqual({ ok: true, providerCleanup: false })
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('reports unauthenticated callers', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as unknown as SupabaseClient
    expect(
      await deactivateAccount(supabase, {
        auth: { admin: { updateUserById: vi.fn() } },
      }),
    ).toEqual({ ok: false, status: 401 })
  })
})
