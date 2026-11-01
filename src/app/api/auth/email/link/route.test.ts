import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
  query: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: mocks,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }),
    }),
    rpc: mocks.rpc,
  }),
}))
vi.mock('@/lib/monitoring/server', () => ({
  withMonitoringRequest: (
    _request: Request,
    _name: string,
    handler: () => Promise<Response>,
  ) => handler(),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const request = (body: unknown) =>
  new Request('https://app.test/api/auth/email/link', {
    method: 'POST',
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user', phone: '919876543210' } },
    error: null,
  })
  mocks.query.mockResolvedValue({ data: { deleted_at: null }, error: null })
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.updateUser.mockResolvedValue({ error: null })
})
describe('email verification linking route', () => {
  it('sends verification for phone-only users without claiming linked identity', async () => {
    const response = await POST(request({ email: 'Person@Example.test' }))
    expect(await response.json()).toEqual({ pending: true })
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { email: 'person@example.test' },
      { emailRedirectTo: 'https://app.test/auth/callback?next=/profile' },
    )
    expect(mocks.rpc).toHaveBeenCalledWith('consume_api_rate_limit', {
      requested_endpoint: 'email-link-send',
      request_limit: 5,
      window_seconds: 3600,
    })
  })
  it('rejects claimed email without changing profiles or merging accounts', async () => {
    mocks.updateUser.mockResolvedValue({
      error: { code: 'email_exists', status: 422 },
    })
    const response = await POST(request({ email: 'claimed@example.test' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'email_in_use' })
  })
  it('rejects invalid input before authentication', async () => {
    expect((await POST(request({ email: 'bad' }))).status).toBe(400)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
  it('requires active authenticated identity and refuses replacing existing verified email', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(401)
    mocks.query.mockResolvedValueOnce({
      data: { deleted_at: '2026-11-01' },
      error: null,
    })
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(403)
    mocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user',
          email: 'already@example.test',
          email_confirmed_at: '2026-11-01',
        },
      },
      error: null,
    })
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(409)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('enforces bounded sends and fails closed on database errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(429)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Offline') })
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(500)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
