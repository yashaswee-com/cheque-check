import { afterEach, describe, expect, it, vi } from 'vitest'
import { securityRepository } from './security.repository'
import { SecurityError } from '../types'
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
afterEach(() => vi.unstubAllGlobals())
describe('strict online security transport', () => {
  it('keeps PIN requests uncached, validates replies, and never converts network errors into unlock', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'unlocked',
            revision: '10000000-0000-4000-8000-000000000001',
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    expect(await securityRepository.verify('123456')).toMatchObject({
      status: 'unlocked',
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/security/pin',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
        body: '{"action":"verify","pin":"123456"}',
      }),
    )
    fetch.mockRejectedValueOnce(new Error('Offline'))
    await expect(securityRepository.verify('123456')).rejects.toMatchObject({
      code: 'unavailable',
    })
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'unlocked' })),
    )
    await expect(securityRepository.verify('123456')).rejects.toBeInstanceOf(
      SecurityError,
    )
  })
  it('surfaces server codes and rejects HTML/proxy errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'rate_limited' }), {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        new Response('<html>Error</html>', { status: 502 }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(securityRepository.status()).rejects.toMatchObject({
      code: 'rate_limited',
    })
    await expect(securityRepository.status()).rejects.toMatchObject({
      code: 'unavailable',
    })
  })
})
