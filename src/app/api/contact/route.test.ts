import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/env/server', () => ({
  getSupabaseAdminEnv: () => ({
    SUPABASE_SERVICE_ROLE_KEY: 'contact-test-secret',
  }),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.logError },
}))
vi.mock('@/lib/monitoring/server', () => ({
  withMonitoringRequest: (
    _request: Request,
    _name: string,
    handler: () => Promise<Response>,
  ) => handler(),
}))

import { POST } from './route'

const message = {
  name: 'Jamie Example',
  email: 'jamie@example.test',
  message: 'Please help me organize my cheque records.',
}

function request(
  body: unknown = message,
  headers: Record<string, string> = { 'x-real-ip': '203.0.113.7' },
) {
  return new Request('https://chequecheck.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: true, error: null })
})

describe('public contact endpoint', () => {
  it('stores a valid message through the private, hashed-IP rate-limit RPC', async () => {
    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({ received: true })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'submit_contact_message',
      expect.objectContaining({
        requested_name: message.name,
        requested_email: message.email,
        requested_message: message.message,
        request_limit: 3,
        window_seconds: 3600,
      }),
    )
    const args = mocks.rpc.mock.calls[0][1]
    expect(args.requested_address_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(args.requested_address_hash).not.toContain('203.0.113.7')
  })

  it('rejects invalid input and oversized bodies before accessing the database', async () => {
    const invalid = await POST(request({ ...message, email: 'not-an-email' }))
    expect(invalid.status).toBe(400)

    const oversized = new Request('https://chequecheck.test/api/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '9000',
        'x-real-ip': '203.0.113.7',
      },
      body: JSON.stringify(message),
    })
    expect((await POST(oversized)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('requires a valid proxy-provided client address', async () => {
    const response = await POST(request(message, {}))
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns an explicit rate-limit response', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null })
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3600')
    expect(await response.json()).toEqual({ error: 'rate_limited' })
  })

  it('does not expose contact data or database errors when storage fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: new Error('database connection unavailable'),
    })
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'submission_unavailable' })
    expect(mocks.logError).toHaveBeenCalledWith(
      'Private contact submission could not be stored',
      expect.any(Error),
    )
  })
})
