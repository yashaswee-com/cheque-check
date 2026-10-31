import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as sendPhoneOtpRoute } from './send/route'
import { POST as verifyPhoneOtpRoute } from './verify/route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  withMonitoringRequest: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/features/auth/server/phone-auth', () => ({
  sendPhoneOtp: mocks.sendPhoneOtp,
  verifyPhoneOtp: mocks.verifyPhoneOtp,
}))

vi.mock('@/lib/monitoring/server', () => ({
  withMonitoringRequest: mocks.withMonitoringRequest,
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.warn },
}))

const supabase = { auth: {} }

function request(body: string) {
  return new Request('https://app.test/api/auth/phone', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue(supabase)
  mocks.withMonitoringRequest.mockImplementation(
    async (
      _request: Request,
      _operation: string,
      handler: () => Promise<Response>,
    ) => handler(),
  )
})

describe('phone OTP route handlers', () => {
  it('sends valid request bodies to the send workflow and prevents caching', async () => {
    const body = { phone: '9876543210', purpose: 'login', captchaToken: 'c1' }
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 30,
    })

    const response = await sendPhoneOtpRoute(request(JSON.stringify(body)))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 30,
    })
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith(supabase, body)
    expect(mocks.withMonitoringRequest).toHaveBeenCalledWith(
      expect.any(Request),
      'auth.phone_send',
      expect.any(Function),
    )
  })

  it('passes malformed JSON as null to the validator and returns its failure', async () => {
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: false,
      status: 400,
      code: 'invalid_request',
    })

    const response = await sendPhoneOtpRoute(request('{'))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'invalid_request',
    })
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith(supabase, null)
  })

  it('returns verification failures with retry metadata and logs no credentials', async () => {
    const body = {
      phone: '9876543210',
      token: '123456',
      purpose: 'login',
    }
    mocks.verifyPhoneOtp.mockResolvedValue({
      ok: false,
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 30,
    })

    const response = await verifyPhoneOtpRoute(request(JSON.stringify(body)))

    expect(response.status).toBe(429)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'rate_limited',
    })
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith(supabase, body)
    expect(mocks.withMonitoringRequest).toHaveBeenCalledWith(
      expect.any(Request),
      'auth.phone_verify',
      expect.any(Function),
    )
    expect(mocks.warn).toHaveBeenCalledWith('Phone auth request rejected', {
      operation: 'auth.phone_verify',
      code: 'rate_limited',
      status: 429,
    })
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(body.phone)
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(body.token)
  })

  it('returns successful verification results without caching', async () => {
    mocks.verifyPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      purpose: 'login',
    })

    const response = await verifyPhoneOtpRoute(
      request(
        JSON.stringify({
          phone: '9876543210',
          token: '123456',
          purpose: 'login',
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      ok: true,
      purpose: 'login',
    })
    expect(mocks.warn).not.toHaveBeenCalled()
  })
})
