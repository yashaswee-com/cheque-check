// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSecurity } from './handler'
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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
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
  it('returns no secrets in status, with no-store cache policy', async () => {
    const response = await handleSecurity(request())
    expect(await response.json()).toEqual({
      enabled: true,
      blocked: false,
      revision,
      emailOtp: true,
      phoneOtp: false,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
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
      options: { shouldCreateUser: false },
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
