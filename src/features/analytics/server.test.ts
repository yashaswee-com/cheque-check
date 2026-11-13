// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { requestSchema } from '@/validators/marketing-analytics'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: mocks.get,
    set: mocks.set,
    delete: mocks.delete,
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
import {
  handleMarketingRequest,
  encodeMarketingCookie,
  decodeMarketingCookie,
  hashMatchingValue,
  matchingData,
} from './server'

const body = {
  action: 'sync',
  accepted: true,
  explicitChoice: true,
  route: '/',
  sessionId: '90000000-0000-4000-8000-000000000001',
}
function request(data: unknown = body, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/analytics/events', {
    method: 'POST',
    headers: {
      origin: 'https://example.test',
      'user-agent': 'Test Browser',
      ...headers,
    },
    body: JSON.stringify(data),
  })
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'true')
  vi.stubEnv(
    'MARKETING_COOKIE_SECRET',
    'illustrative-cookie-secret-at-least-32-characters',
  )
  vi.stubEnv('MARKETING_TRUSTED_IP_HEADER', '')
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name === 'marketing_browser_events' ? [] : true,
    error: null,
  }))
  mocks.getUser
    .mockReset()
    .mockResolvedValue({ data: { user: null }, error: null })
  mocks.get.mockReset().mockReturnValue(undefined)
  mocks.set.mockReset()
  mocks.delete.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe('analytics ingestion', () => {
  it('rejects cross-origin calls and arbitrary event names or routes', async () => {
    expect(
      (
        await handleMarketingRequest(
          request(body, { origin: 'https://other.test' }),
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await handleMarketingRequest(
          request({ ...body, event_name: 'Purchase' }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await handleMarketingRequest(
          request({ ...body, route: '/cheques/private-id' }),
        )
      ).status,
    ).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('is disabled by default without touching storage', async () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'false')
    expect(await (await handleMarketingRequest(request())).json()).toEqual({
      accepted: false,
      events: [],
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects oversized and malformed inputs', async () => {
    expect(
      (
        await handleMarketingRequest(
          request({ ...body, extra: 'x'.repeat(9000) }),
        )
      ).status,
    ).toBe(413)
    expect(
      requestSchema.safeParse({
        ...body,
        firstTouch: { utm_campaign: 'person@example.test' },
      }).success,
    ).toBe(false)
  })
  it('ingests sanitized context and persists a signed HTTP-only consent cookie', async () => {
    const result = await handleMarketingRequest(
      request({
        ...body,
        firstTouch: { utm_source: 'meta' },
        fbclid: 'ad_click_123',
      }),
    )
    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'marketing_sync',
      expect.objectContaining({
        accepted: true,
        event_context: expect.objectContaining({
          source_url: 'https://example.test/',
        }),
      }),
    )
    expect(mocks.set).toHaveBeenCalledWith(
      'cc_marketing',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    )
    expect(mocks.set).toHaveBeenCalledWith(
      '_fbc',
      expect.stringMatching(/^fb\.1\.\d+\.ad_click_123$/),
      expect.any(Object),
    )
  })
  it.each<Record<string, string>>([{ dnt: '1' }, { 'sec-gpc': '1' }])(
    'honors server-visible privacy signals',
    async (headers) => {
      const result = await handleMarketingRequest(request(body, headers))
      expect(await result.json()).toEqual({ accepted: false, events: [] })
      expect(mocks.rpc).toHaveBeenCalledWith(
        'marketing_sync',
        expect.objectContaining({ accepted: false, match_data: {} }),
      )
      expect(mocks.delete).toHaveBeenCalledWith('cc_marketing')
    },
  )
  it('does not revoke account consent merely because another device has no choice', async () => {
    const result = await handleMarketingRequest(
      request({
        ...body,
        hasChoice: false,
        explicitChoice: false,
        accepted: false,
      }),
    )
    expect(result.status).toBe(200)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('returns an explicit failure on storage errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'unavailable' } })
    expect((await handleMarketingRequest(request())).status).toBe(503)
  })
  it('cannot trust raw client-provided user IDs or purchase values', async () => {
    expect(
      (
        await handleMarketingRequest(
          request({ ...body, userId: 'spoofed', amount_paise: 1 }),
        )
      ).status,
    ).toBe(400)
  })
  it('rate-limits ingestion but leaves withdrawal possible', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name !== 'marketing_admit_ingress',
      error: null,
    }))
    expect((await handleMarketingRequest(request())).status).toBe(429)
    expect(
      (await handleMarketingRequest(request({ ...body, accepted: false })))
        .status,
    ).toBe(200)
  })
})

describe('matching and consent integrity', () => {
  it('normalizes and hashes only verified account contact information', () => {
    const user = {
      id: 'illustrative-user',
      email: ' Example@Example.Test ',
      email_confirmed_at: '2026-01-01',
      phone: '+91 98765 43210',
      phone_confirmed_at: '2026-01-01',
    } as User
    const data = matchingData(user, request())
    expect(data).toMatchObject({
      external_id: [hashMatchingValue(user.id)],
      em: [hashMatchingValue('example@example.test')],
      ph: [hashMatchingValue('919876543210')],
    })
    expect(JSON.stringify(data)).not.toContain('Example@')
    expect(
      matchingData(
        {
          ...user,
          email_confirmed_at: undefined,
          phone_confirmed_at: undefined,
        },
        request(),
      ),
    ).not.toHaveProperty('em')
  })
  it('does not trust forwarded IP headers unless explicitly configured', () => {
    const req = request(body, { 'x-forwarded-for': '192.0.2.1' })
    expect(matchingData(null, req)).not.toHaveProperty('client_ip_address')
    vi.stubEnv('MARKETING_TRUSTED_IP_HEADER', 'x-forwarded-for')
    expect(matchingData(null, req)).toHaveProperty(
      'client_ip_address',
      '192.0.2.1',
    )
  })
  it('rejects tampered and expired consent cookies', () => {
    const payload = {
      visitor: crypto.randomUUID(),
      acceptedAt: Date.now(),
      expiresAt: Date.now() + 10000,
    }
    const encoded = encodeMarketingCookie(payload)
    expect(decodeMarketingCookie(encoded)).toEqual(payload)
    expect(decodeMarketingCookie(`${encoded}tampered`)).toBeNull()
    expect(
      decodeMarketingCookie(
        encodeMarketingCookie({ ...payload, expiresAt: Date.now() - 1 }),
      ),
    ).toBeNull()
  })
})
