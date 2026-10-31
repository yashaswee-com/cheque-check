import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSignedMediaUrl } from './use-signed-media-url'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('useSignedMediaUrl', () => {
  it('passes public URLs through, clears absent URLs, and resolves private URLs with credentials', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://signed.example/media' }),
    })
    vi.stubGlobal('fetch', fetch)
    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useSignedMediaUrl(url),
      {
        initialProps: { url: 'https://public.example/image' as string | null },
      },
    )
    expect(result.current.url).toBe('https://public.example/image')
    expect(fetch).not.toHaveBeenCalled()
    rerender({ url: null })
    expect(result.current.url).toBeNull()
    rerender({ url: '/api/storage/images/photo?size=small' })
    await waitFor(() =>
      expect(result.current.url).toBe('https://signed.example/media'),
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/storage/images/photo?size=small&format=json',
      expect.objectContaining({
        credentials: 'same-origin',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result.current.failed).toBe(false)
  })
  it('marks failed resolutions and resets errors when the URL changes', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetch)
    const { result, rerender } = renderHook(
      ({ url }) => useSignedMediaUrl(url),
      { initialProps: { url: '/api/storage/images/missing' } },
    )
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.url).toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      '/api/storage/images/missing?format=json',
      expect.anything(),
    )
    rerender({ url: 'https://public.example/recovered' })
    expect(result.current.failed).toBe(false)
    expect(result.current.url).toBe('https://public.example/recovered')
  })
  it('aborts outstanding requests on cleanup and ignores AbortError', async () => {
    let reject!: (error: Error) => void
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, rejection) => {
          reject = rejection
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const { result, rerender, unmount } = renderHook(
      ({ url }) => useSignedMediaUrl(url),
      { initialProps: { url: '/api/storage/images/first' } },
    )
    const firstSignal = fetch.mock.calls[0][1].signal as AbortSignal
    await act(async () => reject(new DOMException('Aborted', 'AbortError')))
    expect(result.current.failed).toBe(false)
    rerender({ url: '/api/storage/images/second' })
    expect(firstSignal.aborted).toBe(true)
    const secondSignal = fetch.mock.calls[1][1].signal as AbortSignal
    unmount()
    expect(secondSignal.aborted).toBe(true)
  })
})
