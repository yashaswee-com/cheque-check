import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIVATE_AVATAR_BUCKET, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import { GET } from './route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

const userId = 'user-123'
const signedUrl = 'https://storage.test/signed-image'

function request(format?: string) {
  const url = new URL('https://app.test/api/storage/private-cheque-images')
  if (format) url.searchParams.set('format', format)
  return new Request(url)
}

function params(bucket = PRIVATE_CHEQUE_BUCKET, path = [userId, 'cheque.png']) {
  return { params: Promise.resolve({ bucket, path }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: { from: mocks.from },
  })
  mocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl },
    error: null,
  })
  mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl })
})

describe('private storage route', () => {
  it.each([
    ['public bucket', 'public-bucket', [userId, 'photo.png']],
    ['empty path segment', PRIVATE_CHEQUE_BUCKET, [userId, '', 'photo.png']],
    ['dot path segment', PRIVATE_AVATAR_BUCKET, [userId, '.', 'photo.png']],
    ['parent path segment', PRIVATE_CHEQUE_BUCKET, [userId, '..', 'photo.png']],
  ])('rejects %s before authentication', async (_label, bucket, path) => {
    const response = await GET(request(), params(bucket, path))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Media not found' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await GET(request(), params())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects media owned by another user before checking storage access', async () => {
    const response = await GET(
      request(),
      params(PRIVATE_CHEQUE_BUCKET, ['other', 'cheque.png']),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('hides inaccessible media and does not sign it', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null })

    const response = await GET(request(), params())

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Media not found' })
    expect(mocks.rpc).toHaveBeenCalledWith('lifecycle_media_active', {
      requested_bucket: PRIVATE_CHEQUE_BUCKET,
      requested_path: `${userId}/cheque.png`,
    })
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns a private no-store JSON URL for prefetch requests', async () => {
    const response = await GET(request('json'), params(PRIVATE_AVATAR_BUCKET))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ url: signedUrl })
    expect(mocks.from).toHaveBeenCalledWith(PRIVATE_AVATAR_BUCKET)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      `${userId}/cheque.png`,
      60,
    )
  })

  it('redirects normal requests to the signed URL without caching', async () => {
    const response = await GET(request(), params())

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe(signedUrl)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it.each([
    [{ data: null, error: { message: 'storage unavailable' } }],
    [{ data: {}, error: null }],
  ])(
    'returns not found when signing fails or returns no URL',
    async (result) => {
      mocks.createSignedUrl.mockResolvedValue(result)

      const response = await GET(request(), params())

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Media not found' })
    },
  )
})
