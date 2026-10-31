import { describe, expect, it } from 'vitest'
import {
  buildPrivateMediaUrl,
  parsePrivateMediaUrl,
  PRIVATE_AVATAR_BUCKET,
  validateImageFile,
} from './storage'

describe('private storage helpers', () => {
  it('rejects empty and mismatched image payloads', async () => {
    await expect(
      validateImageFile(new File([], 'empty.png', { type: 'image/png' }), 100),
    ).rejects.toThrow('empty')
    await expect(
      validateImageFile(
        new File([new Uint8Array([0xff, 0xd8, 0xff])], 'wrong.png', {
          type: 'image/png',
        }),
        100,
      ),
    ).rejects.toThrow('do not match')
  })

  it('accepts genuine JPEG and WebP signatures', async () => {
    await expect(
      validateImageFile(
        new File([new Uint8Array([0xff, 0xd8, 0xff])], 'image.jpg', {
          type: 'image/jpeg',
        }),
        100,
      ),
    ).resolves.toBe('jpg')
    await expect(
      validateImageFile(
        new File(['RIFF0000WEBP'], 'image.webp', { type: 'image/webp' }),
        100,
      ),
    ).resolves.toBe('webp')
  })

  it('rejects malformed encoding and non-private URL paths', () => {
    expect(
      parsePrivateMediaUrl('/api/storage/private-avatars/%E0%A4%A'),
    ).toBeNull()
    expect(parsePrivateMediaUrl('/public/avatar.png')).toBeNull()
    expect(
      parsePrivateMediaUrl('/api/storage/private-avatars//image.png'),
    ).toBeNull()
  })
  it('uses the file signature rather than the supplied extension', async () => {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const file = new File([signature], 'avatar.exe', { type: 'image/png' })
    await expect(validateImageFile(file, 100)).resolves.toBe('png')
  })

  it('rejects unsupported and oversized files', async () => {
    await expect(
      validateImageFile(
        new File(['text'], 'notes.txt', { type: 'text/plain' }),
        100,
      ),
    ).rejects.toThrow('Only JPEG, PNG, and WebP images are supported')
    await expect(
      validateImageFile(
        new File(['too large'], 'avatar.png', { type: 'image/png' }),
        2,
      ),
    ).rejects.toThrow('Image must be smaller')
  })

  it('builds an encoded authenticated media URL', () => {
    expect(buildPrivateMediaUrl(PRIVATE_AVATAR_BUCKET, 'user/a b.png')).toBe(
      '/api/storage/private-avatars/user/a%20b.png',
    )
  })

  it('parses private URLs and rejects path traversal', () => {
    expect(
      parsePrivateMediaUrl('/api/storage/private-cheque-images/user/image.jpg'),
    ).toEqual({
      bucket: 'private-cheque-images',
      path: ['user', 'image.jpg'],
    })
    expect(
      parsePrivateMediaUrl('/api/storage/private-avatars/user/../image.jpg'),
    ).toBeNull()
  })
})
