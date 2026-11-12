// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {}
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(new Response('offline')),
  }
  const storage = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        'cheque-check-offline-v0',
        'cheque-check-offline-v1',
        'unrelated-cache',
      ]),
    delete: vi.fn().mockResolvedValue(true),
  }
  const fetch = vi.fn().mockResolvedValue(new Response('network'))
  const claim = vi.fn().mockResolvedValue(undefined)
  const skipWaiting = vi.fn().mockResolvedValue(undefined)
  const error = vi.fn()
  runInNewContext(readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8'), {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler
      },
      location: { origin: 'https://app.test' },
      skipWaiting,
    },
    clients: { claim },
    caches: storage,
    fetch,
    URL,
    console: { error },
  })
  function navigate(
    overrides: Partial<{
      url: string
      mode: string
      method: string
      signal: { aborted: boolean }
    }> = {},
  ) {
    const request = {
      url: 'https://app.test/cheques?status=pending',
      mode: 'navigate',
      method: 'GET',
      signal: { aborted: false },
      ...overrides,
    }
    const respondWith = vi.fn()
    handlers.fetch({ request, respondWith })
    return { request, respondWith }
  }
  return {
    handlers,
    cache,
    storage,
    fetch,
    claim,
    skipWaiting,
    error,
    navigate,
  }
}

describe('offline service worker', () => {
  it('precaches only generic fallback assets before taking control', async () => {
    const w = worker()
    const waitUntil = vi.fn()
    w.handlers.install({ waitUntil })
    await waitUntil.mock.calls[0][0]
    expect(w.storage.open).toHaveBeenCalledWith('cheque-check-offline-v2')
    expect(w.cache.addAll).toHaveBeenCalledWith([
      '/offline.html',
      '/offline.js',
    ])
    expect(w.skipWaiting).toHaveBeenCalledOnce()
  })

  it('does not replace the active worker if precaching fails', async () => {
    const w = worker()
    w.cache.addAll.mockRejectedValue(new Error('Offline during install'))
    const waitUntil = vi.fn()
    w.handlers.install({ waitUntil })
    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow(
      'Offline during install',
    )
    expect(w.skipWaiting).not.toHaveBeenCalled()
  })

  it('removes only obsolete offline caches on activation and claims clients', async () => {
    const w = worker()
    const waitUntil = vi.fn()
    w.handlers.activate({ waitUntil })
    await waitUntil.mock.calls[0][0]
    expect(w.storage.delete).toHaveBeenCalledTimes(2)
    expect(w.storage.delete).toHaveBeenCalledWith('cheque-check-offline-v0')
    expect(w.storage.delete).toHaveBeenCalledWith('cheque-check-offline-v1')
    expect(w.claim).toHaveBeenCalledOnce()
  })

  it('returns live navigation responses without caching user data', async () => {
    const w = worker()
    const response = new Response('private page')
    w.fetch.mockResolvedValue(response)
    const { request, respondWith } = w.navigate()
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(response)
    expect(w.fetch).toHaveBeenCalledExactlyOnceWith(request)
    expect(w.storage.open).not.toHaveBeenCalled()
  })

  it('serves the cached fallback on a failed navigation without redirecting the URL', async () => {
    const w = worker()
    w.fetch.mockRejectedValue(new TypeError('Network unavailable'))
    const { respondWith } = w.navigate()
    const response = await respondWith.mock.calls[0][0]
    expect(await response.text()).toBe('offline')
    expect(w.cache.match).toHaveBeenCalledExactlyOnceWith('/offline.html')
  })

  it('preserves HTTP error responses instead of misreporting them as offline', async () => {
    const w = worker()
    const response = new Response('server error', { status: 503 })
    w.fetch.mockResolvedValue(response)
    const { respondWith } = w.navigate()
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(response)
    expect(w.cache.match).not.toHaveBeenCalled()
  })

  it.each([
    { mode: 'cors' },
    { mode: 'same-origin' },
    { method: 'POST' },
    { url: 'https://app.test/api/reports' },
    { url: 'https://app.test/monitoring/events' },
    { url: 'https://app.test/_next/static/chunk.js' },
    { url: 'https://other.test/cheques' },
  ])(
    'does not intercept API, RSC, prefetch, or foreign requests: %j',
    (override) => {
      const w = worker()
      const { respondWith } = w.navigate(override)
      expect(respondWith).not.toHaveBeenCalled()
      expect(w.fetch).not.toHaveBeenCalled()
    },
  )

  it('does not turn cancelled navigations into offline pages', async () => {
    const w = worker()
    const failure = new Error('Aborted')
    w.fetch.mockRejectedValue(failure)
    const { respondWith } = w.navigate({ signal: { aborted: true } })
    await expect(respondWith.mock.calls[0][0]).rejects.toBe(failure)
    expect(w.cache.match).not.toHaveBeenCalled()
  })

  it('serves the fallback script from cache while offline', async () => {
    const w = worker()
    const { respondWith } = w.navigate({
      url: 'https://app.test/offline.js',
      mode: 'no-cors',
    })
    await respondWith.mock.calls[0][0]
    expect(w.cache.match).toHaveBeenCalledExactlyOnceWith('/offline.js')
    expect(w.fetch).not.toHaveBeenCalled()
  })

  it('reports a missing offline fallback rather than pretending recovery', async () => {
    const w = worker()
    w.cache.match.mockResolvedValue(undefined)
    const failure = new TypeError('Network unavailable')
    w.fetch.mockRejectedValue(failure)
    const { respondWith } = w.navigate()
    await expect(respondWith.mock.calls[0][0]).rejects.toBe(failure)
    expect(w.error).toHaveBeenCalledWith('Offline fallback is unavailable')
  })
})
