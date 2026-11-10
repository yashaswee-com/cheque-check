import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  updateSession: vi.fn(),
  nodeLoaded: vi.fn(),
  edgeLoaded: vi.fn(),
  sentryOptions: vi.fn(() => ({ enabled: false })),
}))
vi.mock('@sentry/nextjs', () => mocks)
vi.mock('../sentry.server.config', () => {
  mocks.nodeLoaded()
  return {}
})
vi.mock('../sentry.edge.config', () => {
  mocks.edgeLoaded()
  return {}
})
vi.mock('@/lib/monitoring/sentry-options', () => mocks)
vi.mock('@/lib/supabase/middleware', () => mocks)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('Next runtime entry points', () => {
  it.each(['nodejs', 'edge', 'other'])(
    'initializes only %s monitoring configuration',
    async (runtime) => {
      vi.stubEnv('NEXT_RUNTIME', runtime)
      const { register, onRequestError } = await import('./instrumentation')
      await register()
      expect(mocks.nodeLoaded).toHaveBeenCalledTimes(
        runtime === 'nodejs' ? 1 : 0,
      )
      expect(mocks.edgeLoaded).toHaveBeenCalledTimes(runtime === 'edge' ? 1 : 0)
      expect(onRequestError).toBe(mocks.captureRequestError)
    },
  )

  it('initializes browser monitoring and forwards the router hook', async () => {
    const { onRouterTransitionStart } = await import('./instrumentation-client')
    expect(mocks.sentryOptions).toHaveBeenCalledWith('browser')
    expect(mocks.init).toHaveBeenCalledWith({ enabled: false })
    expect(onRouterTransitionStart).toBe(mocks.captureRouterTransitionStart)
  })

  it('delegates proxy requests and excludes only infrastructure/static paths', async () => {
    const response = new Response('session response')
    mocks.updateSession.mockResolvedValue(response)
    const { proxy, config } = await import('./proxy')
    const request = new NextRequest('https://app.example/cheques')
    await expect(proxy(request)).resolves.toBe(response)
    expect(mocks.updateSession).toHaveBeenCalledExactlyOnceWith(request)
    const matcher = new RegExp(`^${config.matcher[0]}$`)
    for (const path of [
      '/monitoring',
      '/monitoring/events',
      '/_next/static/chunk.js',
      '/sw.js',
      '/offline.html',
      '/offline.js',
      '/logo.png',
    ])
      expect(matcher.test(path)).toBe(false)
    for (const path of [
      '/cheques',
      '/api/ocr/cheque',
      '/settings',
      '/monitoring-preferences',
    ])
      expect(matcher.test(path)).toBe(true)
  })
})
