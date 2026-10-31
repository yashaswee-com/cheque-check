import type { CookieOptions } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSession } from './middleware'
import { createClient as createServer } from './server'
import { createClient as createBrowser } from './client'
import { createAdminClient } from './admin'

type Cookie = { name: string; value: string; options?: CookieOptions }
type CookieAdapter = {
  getAll: () => Cookie[]
  setAll: (cookies: Cookie[]) => void
}
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
  createBrowserClient: vi.fn(),
  createClient: vi.fn(),
  store: { getAll: vi.fn(), set: vi.fn() },
}))
vi.mock('@supabase/ssr', () => mocks)
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('next/headers', () => ({ cookies: async () => mocks.store }))
vi.mock('@/lib/env/client', () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon',
  },
}))
vi.mock('@/lib/env/server', () => ({
  getSupabaseAdminEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-admin' }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } })
  mocks.createBrowserClient.mockReturnValue({ browser: true })
  mocks.createClient.mockReturnValue({ admin: true })
  mocks.store.getAll.mockReturnValue([{ name: 'session', value: 'existing' }])
  mocks.store.set.mockReset()
})
afterEach(() => vi.restoreAllMocks())

function adapter(): CookieAdapter {
  return mocks.createServerClient.mock.calls[0][2].cookies
}

describe('session middleware', () => {
  it.each(['/', '/login', '/signup', '/forgot-password', '/auth/callback'])(
    'permits anonymous access to %s',
    async (path) => {
      const response = await updateSession(
        new NextRequest(`https://app.example${path}`),
      )
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('location')).toBeNull()
    },
  )

  it('redirects anonymous private routes to login while preserving the URL query', async () => {
    const response = await updateSession(
      new NextRequest('https://app.example/cheques?view=all'),
    )
    expect(response.headers.get('location')).toBe(
      'https://app.example/login?view=all',
    )
  })

  it.each(['/login', '/signup', '/forgot-password'])(
    'redirects authenticated users away from %s',
    async (path) => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      const response = await updateSession(
        new NextRequest(`https://app.example${path}`),
      )
      expect(response.headers.get('location')).toBe(
        'https://app.example/dashboard',
      )
    },
  )

  it('passes authenticated requests and synchronizes refreshed cookies', async () => {
    const request = new NextRequest('https://app.example/cheques', {
      headers: { cookie: 'session=old' },
    })
    mocks.getUser.mockImplementation(async () => {
      expect(adapter().getAll()).toEqual([{ name: 'session', value: 'old' }])
      adapter().setAll([
        {
          name: 'session',
          value: 'refreshed',
          options: { httpOnly: true, path: '/' },
        },
      ])
      return { data: { user: { id: 'u1' } } }
    })
    const response = await updateSession(request)
    expect(request.cookies.get('session')?.value).toBe('refreshed')
    expect(response.cookies.get('session')?.value).toBe('refreshed')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('location')).toBeNull()
  })
})

describe('Supabase client composition', () => {
  it('uses server cookie adapters and tolerates read-only Server Component cookies', async () => {
    await createServer()
    expect(adapter().getAll()).toEqual([{ name: 'session', value: 'existing' }])
    adapter().setAll([
      { name: 'session', value: 'new', options: { path: '/' } },
    ])
    expect(mocks.store.set).toHaveBeenCalledWith('session', 'new', {
      path: '/',
    })
    mocks.store.set.mockImplementation(() => {
      throw new Error('read-only cookies')
    })
    expect(() =>
      adapter().setAll([{ name: 'session', value: 'new' }]),
    ).not.toThrow()
  })

  it('composes the browser SDK with public credentials', () => {
    expect(createBrowser()).toEqual({ browser: true })
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'synthetic-anon',
    )
  })

  it('disables persistence and token refresh for the admin client', () => {
    expect(createAdminClient()).toEqual({ admin: true })
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'synthetic-admin',
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
  })
})
