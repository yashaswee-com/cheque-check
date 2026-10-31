import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TABLES } from '@/lib/supabase/tables'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUser: vi.fn(),
  rateLimitRpc: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  profileSingle: vi.fn(),
  jobSingle: vi.fn(),
  setRequestUser: vi.fn(),
  withMonitoringRequest: vi.fn(),
  getSupabaseAdminEnv: vi.fn(),
  error: vi.fn(),
  profile: null as unknown,
  job: null as unknown,
  profileError: null as unknown,
  insertError: null as unknown,
  jobError: null as unknown,
  rateError: null as unknown,
  rateAllowed: true,
  dispatcherResponse: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/env/client', () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.test' },
}))

vi.mock('@/lib/env/server', () => ({
  getSupabaseAdminEnv: mocks.getSupabaseAdminEnv,
}))

vi.mock('@/lib/monitoring/server', () => ({
  setRequestUser: mocks.setRequestUser,
  withMonitoringRequest: mocks.withMonitoringRequest,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.error },
}))

function request() {
  return new Request('https://app.test/api/notifications/test-voice', {
    method: 'POST',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.profile = { phone: '+919876543210', voice_call_enabled: true }
  mocks.job = { status: 'sent', last_error: null }
  mocks.profileError = null
  mocks.insertError = null
  mocks.jobError = null
  mocks.rateError = null
  mocks.rateAllowed = true
  mocks.dispatcherResponse = { ok: true, status: 200 }
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  })
  mocks.rateLimitRpc.mockImplementation(async () => ({
    data: mocks.rateAllowed,
    error: mocks.rateError,
  }))
  mocks.profileSingle.mockImplementation(async () => ({
    data: mocks.profile,
    error: mocks.profileError,
  }))
  mocks.jobSingle.mockImplementation(async () => ({
    data: mocks.job,
    error: mocks.jobError,
  }))
  mocks.insert.mockImplementation(async () => ({ error: mocks.insertError }))
  mocks.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: table === TABLES.PROFILES ? mocks.profileSingle : mocks.jobSingle,
    insert: mocks.insert,
  }))
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rateLimitRpc,
    from: mocks.from,
  })
  mocks.createAdminClient.mockReturnValue({ from: mocks.from })
  mocks.getSupabaseAdminEnv.mockReturnValue({
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  })
  mocks.withMonitoringRequest.mockImplementation(
    async (
      _request: Request,
      _operation: string,
      handler: () => Promise<Response>,
    ) => handler(),
  )
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => mocks.dispatcherResponse as Response,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('test voice route', () => {
  it.each(['rateError', 'profileError', 'insertError', 'jobError'] as const)(
    'logs %s and returns an explicit server failure',
    async (key) => {
      const error = new Error(`${key} unavailable`)
      mocks[key] = error
      const response = await POST(request())
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: 'Unable to trigger test call',
      })
      expect(mocks.error).toHaveBeenCalledWith(
        'Failed to trigger test voice call',
        error,
      )
    },
  )

  it.each([null, { phone: null, voice_call_enabled: true }])(
    'rejects missing profile or phone without dispatching: %j',
    async (profile) => {
      mocks.profile = profile
      expect((await POST(request())).status).toBe(400)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('returns a gateway fallback for failed jobs without provider details', async () => {
    mocks.job = { status: 'failed', last_error: null }
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Could not place the test call.',
    })
  })
  it('requires authentication before applying the rate limit', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.rateLimitRpc).not.toHaveBeenCalled()
  })

  it('returns a retry header when rate limited', async () => {
    mocks.rateAllowed = false

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('300')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('requires voice reminders to be enabled with a phone number', async () => {
    mocks.profile = { phone: null, voice_call_enabled: false }

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Enable Voice Reminders and set your phone number first.',
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('returns success when the test call is sent', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        channel: 'voice',
        purpose: 'sample_voice_test',
        payload: {},
      }),
    )
    expect(fetch).toHaveBeenCalledWith(
      'https://project.test/functions/v1/notifications-dispatcher',
      expect.objectContaining({ method: 'POST' }),
    )
    const inserted = mocks.insert.mock.calls[0][0]
    expect(fetch).toHaveBeenCalledWith(
      'https://project.test/functions/v1/notifications-dispatcher',
      expect.objectContaining({
        body: JSON.stringify({ userId: 'user-1', jobIds: [inserted.id] }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('reports exhausted voice quota', async () => {
    mocks.job = {
      status: 'failed',
      last_error: 'Voice reminder quota exhausted',
    }

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "You've used all your Voice Reminder calls for this period.",
    })
  })

  it.each(['pending', 'processing'])(
    'reports a queued test call when its job is %s',
    async (status) => {
      mocks.job = { status, last_error: null }

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, queued: true })
    },
  )

  it('returns gateway failure details for a failed dispatch job', async () => {
    mocks.job = { status: 'failed', last_error: 'Carrier unavailable' }

    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Carrier unavailable' })
  })

  it('logs and returns an explicit failure when dispatcher call fails', async () => {
    mocks.dispatcherResponse = { ok: false, status: 503 }

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Unable to trigger test call',
    })
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to trigger test voice call',
      expect.objectContaining({ message: 'Dispatcher returned 503' }),
    )
  })
})
