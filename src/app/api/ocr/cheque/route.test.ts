import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  profile: vi.fn(),
  rpc: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: mocks.profile }) }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))
vi.mock('@/lib/monitoring/server', () => ({
  setRequestUser: vi.fn(),
  withMonitoringRequest: (
    _: Request,
    __: string,
    callback: () => Promise<Response>,
  ) => callback(),
}))
const imageUrl =
  '/api/storage/private-cheque-images/10000000-0000-4000-8000-000000000001/image.jpg'
const start = {
  action: 'start',
  imageUrl,
  mode: 'Inward',
  key: '10000000-0000-4000-8000-000000000002',
  consent: '2026-11-14',
}
const request = (body: unknown) =>
  new Request('https://app.test/api/ocr/cheque', {
    method: 'POST',
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mocks.profile.mockResolvedValue({
    data: { ai_scan_enabled: true },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: true, error: null })
})
describe('durable scan endpoint', () => {
  it('requires authenticated active profiles and honors disabled mode before rate/quota work', async () => {
    mocks.profile.mockResolvedValueOnce({
      data: { ai_scan_enabled: false },
      error: null,
    })
    const response = await POST(request(start))
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('AI_SCAN_DISABLED')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await POST(request(start))).status).toBe(401)
  })
  it('rejects legacy requests, remote URLs and malformed input rather than bypassing the durable contract', async () => {
    for (const body of [
      { imageUrl },
      { ...start, imageUrl: 'https://evil.test/image.jpg' },
      { ...start, key: 'not-a-key' },
    ]) {
      expect((await POST(request(body))).status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('starts through atomic reservation RPC, never direct quota consumption/provider work', async () => {
    await POST(request(start))
    expect(mocks.rpc).toHaveBeenCalledWith('begin_cheque_scan', {
      requested_image: imageUrl,
      requested_key: start.key,
      requested_consent: '2026-11-14',
      requested_mode: 'Inward',
    })
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'consume_user_quota',
      expect.anything(),
    )
  })
  it('reads and cancels existing scans even when new scans are disabled', async () => {
    mocks.profile.mockResolvedValue({
      data: { ai_scan_enabled: false },
      error: null,
    })
    expect((await POST(request({ action: 'read', imageUrl }))).status).toBe(200)
    expect(
      (await POST(request({ action: 'cancel', jobId: start.key }))).status,
    ).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_cheque_scan', {
      requested_job: start.key,
      requested_action: 'cancel',
    })
  })
  it('returns typed credit/consent/overload errors and redacts unknown database details', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'consume_api_rate_limit'
        ? { data: true }
        : { error: { message: 'CONSENT_REQUIRED' } },
    )
    expect((await POST(request(start))).status).toBe(403)
    mocks.rpc.mockResolvedValue({
      error: { message: 'private account 123456789' },
    })
    const response = await POST(request({ action: 'read', imageUrl }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('123456789')
    expect(mocks.error).toHaveBeenCalledWith('ocr.request.failed')
  })
  it('rate limits new attempts but not result recovery', async () => {
    mocks.rpc.mockResolvedValue({ data: false })
    const response = await POST(request(start))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect((await POST(request({ action: 'read', imageUrl }))).status).toBe(200)
  })
})
