import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

const origin = 'https://app.test'

function request(query = '') {
  return new Request(`${origin}/auth/callback${query}`)
}

function requestWithNext(next: string) {
  const url = new URL(`${origin}/auth/callback`)
  url.searchParams.set('code', 'oauth-code')
  url.searchParams.set('next', next)
  return new Request(url)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
  })
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auth callback route', () => {
  it('exchanges the code and redirects to a same-origin path', async () => {
    const response = await GET(request('?code=oauth-code&next=%2Fdashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe(`${origin}/dashboard`)
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code')
  })

  it.each(['//attacker.test/path', '/\\attacker.test/path'])(
    'falls back to the home page for an off-origin redirect path',
    async (next) => {
      const response = await GET(requestWithNext(next))

      expect(response.headers.get('Location')).toBe(`${origin}/`)
    },
  )

  it('redirects provider errors to the login page with an encoded message', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'OAuth failed & retry' },
    })

    const response = await GET(request('?code=oauth-code'))

    expect(response.headers.get('Location')).toBe(
      `${origin}/login?error=OAuth%20failed%20%26%20retry`,
    )
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('redirects requests with no code to login', async () => {
    const response = await GET(request())

    expect(response.headers.get('Location')).toBe(
      `${origin}/login?error=Authentication%20code%20missing`,
    )
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns a safe login redirect when the auth client fails', async () => {
    mocks.createClient.mockRejectedValue(new Error('database details'))

    const response = await GET(request('?code=oauth-code'))

    expect(response.headers.get('Location')).toBe(
      `${origin}/login?error=Internal%20server%20error`,
    )
    expect(console.error).toHaveBeenCalledWith(
      'Unexpected error in auth callback:',
      expect.any(Error),
    )
  })
})
