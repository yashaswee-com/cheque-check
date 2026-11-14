// @vitest-environment node
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}))

import { updateSession } from './middleware'
import { config } from '@/proxy'

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
})

describe('public middleware access', () => {
  it.each(['/assets/ad.mp4', '/assets/voice-reminder.mp3'])(
    'serves the public demo %s without an auth redirect',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
    },
  )

  it.each([
    '/assets/private.mp4',
    '/assets/ad.mp4/details',
    '/api/reports/export.mp4',
    '/dashboard',
  ])('keeps the proxy active for %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
  })
  it.each(['/features', '/pricing', '/privacy', '/contact'])(
    'does not redirect signed-out visitors from %s',
    async (path) => {
      const request = new NextRequest(`https://chequecheck.test${path}`)
      const response = await updateSession(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-request-x-public-site')).toBe(
        'true',
      )
    },
  )

  it('allows the contact endpoint but does not apply the public page shell', async () => {
    const response = await updateSession(
      new NextRequest('https://chequecheck.test/api/contact', {
        method: 'POST',
      }),
    )
    expect(response.status).toBe(200)
    expect(
      response.headers.get('x-middleware-request-x-public-site'),
    ).toBeNull()
  })
  it('lets the OCR handler return its authenticated JSON contract without a page redirect', async () => {
    const response = await updateSession(
      new NextRequest('https://chequecheck.test/api/ocr/cheque', {
        method: 'POST',
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(
      response.headers.get('x-middleware-request-x-public-site'),
    ).toBeNull()
  })

  it('keeps the existing signed-in feature catalogue protected and preserves its return path', async () => {
    const response = await updateSession(
      new NextRequest(
        'https://chequecheck.test/features/catalog?purchase=lifetime_premium',
      ),
    )
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe(
      '/features/catalog?purchase=lifetime_premium',
    )
  })

  it.each(['/feedback', '/roadmap'])(
    'keeps signed-in-only route %s protected',
    async (path) => {
      const response = await updateSession(
        new NextRequest(`https://chequecheck.test${path}`),
      )
      expect(response.status).toBe(307)
      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('next')).toBe(path)
    },
  )

  it('does not trust a caller-supplied public-shell header on private paths', async () => {
    const response = await updateSession(
      new NextRequest('https://chequecheck.test/dashboard', {
        headers: { 'x-public-site': 'true' },
      }),
    )
    expect(response.status).toBe(307)
    expect(
      response.headers.get('x-middleware-request-x-public-site'),
    ).toBeNull()
  })
})
