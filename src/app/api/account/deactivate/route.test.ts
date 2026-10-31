import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  deactivateAccount: vi.fn(),
  withMonitoringRequest: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/features/auth/server/deactivate-account', () => ({
  deactivateAccount: mocks.deactivateAccount,
}))

vi.mock('@/lib/monitoring/server', () => ({
  withMonitoringRequest: mocks.withMonitoringRequest,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.error },
}))

const supabase = { auth: {} }
const admin = { auth: { admin: {} } }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue(supabase)
  mocks.createAdminClient.mockReturnValue(admin)
  mocks.withMonitoringRequest.mockImplementation(
    async (
      _request: Request,
      _operation: string,
      handler: () => Promise<Response>,
    ) => handler(),
  )
})

const request = () =>
  new Request('https://app.test/api/account/deactivate', { method: 'POST' })

describe('account deactivation route', () => {
  it('returns successful deactivation without caching', async () => {
    mocks.deactivateAccount.mockResolvedValue({
      ok: true,
      providerCleanup: true,
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      success: true,
      providerCleanup: true,
    })
    expect(mocks.deactivateAccount).toHaveBeenCalledWith(supabase, admin)
    expect(mocks.withMonitoringRequest).toHaveBeenCalledWith(
      expect.any(Request),
      'account.deactivate',
      expect.any(Function),
    )
  })

  it.each([
    [{ ok: false, status: 401 }, 401, 'Unauthorized'],
    [{ ok: false, status: 500 }, 500, 'Unable to deactivate'],
  ] as const)(
    'maps failed workflow outcomes to HTTP status $status',
    async (result, status, message) => {
      mocks.deactivateAccount.mockResolvedValue(result)

      const response = await POST(request())

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error: message })
    },
  )

  it('reports incomplete identity-provider cleanup while preserving success', async () => {
    mocks.deactivateAccount.mockResolvedValue({
      ok: true,
      providerCleanup: false,
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      providerCleanup: false,
    })
    expect(mocks.error).toHaveBeenCalledWith(
      'Account deactivated but provider cleanup was incomplete',
    )
  })

  it('returns an explicit failure and logs unexpected errors', async () => {
    const error = new Error('backend unavailable')
    mocks.createClient.mockRejectedValue(error)

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Unable to deactivate' })
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to deactivate account',
      error,
    )
  })
})
