// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSecurity } from './handler'
import { logger } from '@/lib/logger'
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: vi.fn(),
  pin: vi.fn(),
  rate: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  digest: vi.fn(),
  phoneEnabled: 'false',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: mocks,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }),
    }),
    rpc: mocks.rate,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.pin }) }),
    }),
    rpc: mocks.rpc,
  }),
}))
vi.mock('@/lib/env/client', () => ({
  publicEnv: {
    get NEXT_PUBLIC_PHONE_AUTH_ENABLED() {
      return mocks.phoneEnabled
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('./crypto', () => ({
  pinDigest: mocks.digest,
  randomSecret: () => 'c'.repeat(64),
  proofDigest: () => 'd'.repeat(64),
}))
const revision = '10000000-0000-4000-8000-000000000001'
const request = (body?: unknown) =>
  new Request('https://app.test/api/security/pin', {
    method: body ? 'POST' : 'GET',
    ...(body
      ? { body: JSON.stringify(body), headers: { origin: 'https://app.test' } }
      : {}),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.phoneEnabled = 'false'
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user',
        email: 'user@test.invalid',
        email_confirmed_at: '2026-01-01',
      },
    },
    error: null,
  })
  mocks.profile.mockResolvedValue({ data: { deleted_at: null }, error: null })
  mocks.pin.mockResolvedValue({
    data: {
      digest: 'a'.repeat(64),
      salt: 'b'.repeat(64),
      revision,
      failures: 0,
    },
    error: null,
  })
  mocks.rate.mockResolvedValue({ data: true, error: null })
  mocks.rpc.mockResolvedValue({
    data: { status: 'unlocked', revision },
    error: null,
  })
  mocks.digest.mockResolvedValue('a'.repeat(64))
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: 'user' } },
    error: null,
  })
  mocks.verifyOtp.mockResolvedValue({
    data: { user: { id: 'user' } },
    error: null,
  })
  mocks.signInWithOtp.mockResolvedValue({ error: null })
})
describe('authenticated PIN verification and recovery API', () => {
  it.each([
    [
      'phone',
      {
        phone: '919876543210',
        phone_confirmed_at: '2026-01-01',
        app_metadata: { providers: ['phone'] },
      },
    ],
    [
      'email',
      {
        email: 'google@test.invalid',
        email_confirmed_at: '2026-01-01',
        app_metadata: { providers: ['google'] },
      },
    ],
  ] as const)(
    'mints the same fresh proof for passwordless %s accounts using only confirmed contacts',
    async (channel, identity) => {
      mocks.phoneEnabled = 'true'
      mocks.getUser.mockResolvedValue({
        data: { user: { id: 'user', ...identity } },
        error: null,
      })
      const status = await (await handleSecurity(request())).json()
      expect(status.emailOtp).toBe(channel === 'email')
      expect(status.phoneOtp).toBe(channel === 'phone')
      expect(
        (await handleSecurity(request({ action: 'sendOtp', channel }))).status,
      ).toBe(200)
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        [channel]: channel === 'email' ? 'google@test.invalid' : '919876543210',
        options: { shouldCreateUser: false, captchaToken: undefined },
      })
      const proof = await handleSecurity(
        request({ action: 'otp', channel, token: '123456' }),
      )
      expect(await proof.json()).toEqual({ proof: 'c'.repeat(64) })
      expect(mocks.rpc).toHaveBeenCalledWith('security_pin_proof', {
        requested_user: 'user',
        requested_proof: 'd'.repeat(64),
      })
      expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    },
  )
  it('returns no secrets in status, with no-store cache policy', async () => {
    const response = await handleSecurity(request())
    expect(await response.json()).toEqual({
      enabled: true,
      blocked: false,
      revision,
      emailOtp: true,
      phoneOtp: false,
      lockTimeoutSeconds: 60,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('reports the stored lock timeout and saves allowed timeouts through the service RPC', async () => {
    mocks.pin.mockResolvedValueOnce({
      data: {
        digest: 'a'.repeat(64),
        salt: 'b'.repeat(64),
        revision,
        failures: 0,
        lock_timeout_seconds: 900,
      },
      error: null,
    })
    expect(
      (await (await handleSecurity(request())).json()).lockTimeoutSeconds,
    ).toBe(900)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    const saved = await handleSecurity(
      request({ action: 'timeout', seconds: 300 }),
    )
    expect(await saved.json()).toEqual({ saved: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('security_pin_timeout', {
      requested_user: 'user',
      requested_seconds: 300,
    })
    expect(mocks.rate).toHaveBeenLastCalledWith(
      'consume_api_rate_limit',
      expect.objectContaining({ requested_endpoint: 'security-pin-action' }),
    )
  })
  it('rejects unsupported timeouts and timeouts without an enabled PIN', async () => {
    for (const seconds of [0, 30, 7200]) {
      expect(
        (await handleSecurity(request({ action: 'timeout', seconds }))).status,
      ).toBe(400)
    }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001' } })
    const disabled = await handleSecurity(
      request({ action: 'timeout', seconds: 60 }),
    )
    expect(disabled.status).toBe(409)
    expect(await disabled.json()).toEqual({ error: 'pin_disabled' })
  })
  it('verifies online and revokes sessions on fifth failure', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'blocked', remaining: 0 },
      error: null,
    })
    const response = await handleSecurity(
      request({ action: 'verify', pin: '123456' }),
    )
    expect(await response.json()).toEqual({ status: 'blocked', remaining: 0 })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'security_pin_check',
      expect.objectContaining({
        requested_user: 'user',
        requested_revision: revision,
      }),
    )
  })
  it('does not derive an expensive digest for a blocked account', async () => {
    mocks.pin.mockResolvedValue({
      data: {
        digest: 'a'.repeat(64),
        salt: 'b'.repeat(64),
        revision,
        failures: 5,
      },
      error: null,
    })
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'blocked', remaining: 0 },
      error: null,
    })
    await handleSecurity(request({ action: 'verify', pin: '123456' }))
    expect(mocks.digest).not.toHaveBeenCalled()
  })
  it('requires verified identity and mints single-use server proof only after fresh password authentication', async () => {
    const response = await handleSecurity(
      request({ action: 'password', password: 'account-password' }),
    )
    expect(await response.json()).toEqual({ proof: 'c'.repeat(64) })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@test.invalid',
      password: 'account-password',
      options: { captchaToken: undefined },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('security_pin_proof', {
      requested_user: 'user',
      requested_proof: 'd'.repeat(64),
    })
  })
  it('does not mint proof for wrong password or a different returned identity', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'other' } },
      error: null,
    })
    expect(
      (await handleSecurity(request({ action: 'password', password: 'bad' })))
        .status,
    ).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('sends OTP only to the existing confirmed identifier and never creates accounts', async () => {
    await handleSecurity(
      request({
        action: 'sendOtp',
        channel: 'email',
        email: 'attacker@test.invalid',
      }),
    )
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'user@test.invalid',
      options: { shouldCreateUser: false, captchaToken: undefined },
    })
    expect(mocks.rate).toHaveBeenCalledWith('consume_api_rate_limit', {
      requested_endpoint: 'security-otp-send',
      request_limit: 5,
      window_seconds: 3600,
    })
    const response = await handleSecurity(
      request({ action: 'otp', channel: 'email', token: '123456' }),
    )
    expect(response.status).toBe(200)
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'user@test.invalid',
      token: '123456',
      type: 'email',
    })
  })
  it('keeps phone recovery disabled when phone authentication is disabled', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user',
          phone: '919876543210',
          phone_confirmed_at: '2026-01-01',
        },
      },
      error: null,
    })
    expect(
      (await handleSecurity(request({ action: 'sendOtp', channel: 'phone' })))
        .status,
    ).toBe(409)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    mocks.phoneEnabled = 'true'
    expect(
      (await handleSecurity(request({ action: 'sendOtp', channel: 'phone' })))
        .status,
    ).toBe(200)
  })
  it.each(['email', 'phone'] as const)(
    'forwards CAPTCHA tokens for %s OTP sends and password reauthentication',
    async (channel) => {
      mocks.phoneEnabled = 'true'
      const contact = channel === 'email' ? 'user@test.invalid' : '919876543210'
      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user',
            [channel]: contact,
            [`${channel}_confirmed_at`]: '2026-01-01',
          },
        },
        error: null,
      })
      expect(
        (
          await handleSecurity(
            request({
              action: 'sendOtp',
              channel,
              captchaToken: 'send-captcha',
            }),
          )
        ).status,
      ).toBe(200)
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        [channel]: contact,
        options: { shouldCreateUser: false, captchaToken: 'send-captcha' },
      })
      expect(
        (
          await handleSecurity(
            request({
              action: 'password',
              password: 'account-password',
              captchaToken: 'password-captcha',
            }),
          )
        ).status,
      ).toBe(200)
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        [channel]: contact,
        password: 'account-password',
        options: { captchaToken: 'password-captcha' },
      })
    },
  )
  it.each(['sendOtp', 'password'] as const)(
    'reports CAPTCHA rejection as 400, not an outage, for %s',
    async (action) => {
      const error = {
        code: 'captcha_failed',
        status: 400,
        message: 'Private provider details',
      }
      const provider =
        action === 'sendOtp' ? mocks.signInWithOtp : mocks.signInWithPassword
      provider.mockResolvedValueOnce({ data: { user: null }, error })
      const response = await handleSecurity(
        request(
          action === 'sendOtp'
            ? { action, channel: 'email' }
            : { action, password: 'account-password' },
        ),
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'captcha_failed' })
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(mocks.rpc).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        'Security CAPTCHA verification failed',
        {
          operation:
            action === 'sendOtp'
              ? 'security.otp_send'
              : 'security.reauthenticate',
          code: 'captcha_failed',
          status: 400,
        },
      )
      expect(logger.error).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['over_email_send_rate_limit', 422],
    ['over_sms_send_rate_limit', 422],
    ['over_request_rate_limit', 429],
    ['unknown', 429],
  ])(
    'maps provider rate limiting (%s) to a retryable 429',
    async (code, status) => {
      mocks.signInWithOtp.mockResolvedValueOnce({ error: { code, status } })
      const response = await handleSecurity(
        request({ action: 'sendOtp', channel: 'email' }),
      )
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'rate_limited' })
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
  it('distinguishes delivery outages from invalid passwords or codes', async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({
      error: {
        code: 'unexpected_failure',
        status: 500,
        message: 'Private details',
      },
    })
    const response = await handleSecurity(
      request({ action: 'sendOtp', channel: 'email' }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'delivery_failed' })
    expect(logger.error).toHaveBeenCalledWith(
      'Security account verification failed',
      undefined,
      {
        operation: 'security.otp_send',
        code: 'unexpected_failure',
        status: 500,
      },
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['sendOtp', 'password'] as const)(
    'rejects empty or oversized CAPTCHA tokens before calling Auth for %s',
    async (action) => {
      for (const captchaToken of ['', 'x'.repeat(4097)]) {
        const response = await handleSecurity(
          request(
            action === 'sendOtp'
              ? { action, channel: 'email', captchaToken }
              : { action, password: 'account-password', captchaToken },
          ),
        )
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'invalid_input' })
      }
      expect(mocks.signInWithOtp).not.toHaveBeenCalled()
      expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    },
  )
  it('requires valid fresh proof for setup, removal and reset without altering profile or entity records', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001' } })
    expect(
      (
        await handleSecurity(
          request({ action: 'set', pin: '123456', proof: 'c'.repeat(64) }),
        )
      ).status,
    ).toBe(403)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(
      (
        await handleSecurity(
          request({ action: 'remove', proof: 'c'.repeat(64) }),
        )
      ).status,
    ).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('security_pin_manage', {
      requested_user: 'user',
      requested_proof: 'd'.repeat(64),
    })
  })
  it('rejects malformed PIN and cross-origin mutation', async () => {
    expect(
      (await handleSecurity(request({ action: 'verify', pin: '1234' }))).status,
    ).toBe(400)
    expect(mocks.digest).not.toHaveBeenCalled()
    const cross = new Request('https://app.test/api/security/pin', {
      method: 'POST',
      headers: { origin: 'https://evil.test' },
      body: JSON.stringify({ action: 'verify', pin: '123456' }),
    })
    expect((await handleSecurity(cross)).status).toBe(403)
  })
  it('enforces auth, lifecycle, rate limits and database failures before expensive derivation', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await handleSecurity(request())).status).toBe(401)
    mocks.profile.mockResolvedValueOnce({
      data: { deleted_at: '2026' },
      error: null,
    })
    expect((await handleSecurity(request())).status).toBe(403)
    mocks.rate.mockResolvedValueOnce({ data: false, error: null })
    expect(
      (await handleSecurity(request({ action: 'verify', pin: '123456' })))
        .status,
    ).toBe(429)
    mocks.pin.mockResolvedValueOnce({ data: null, error: new Error('Offline') })
    expect((await handleSecurity(request())).status).toBe(503)
    expect(mocks.digest).not.toHaveBeenCalled()
  })
})
