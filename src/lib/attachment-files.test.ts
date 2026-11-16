import { describe, expect, it } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  validateAttachmentFiles,
} from './attachment-files'

describe('attachment file limits', () => {
  it('accepts two supported files at the combined limit and rejects one byte more', () => {
    const first = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES - 1)],
      'first.txt',
      { type: 'text/plain' },
    )
    const second = new File(['x'], 'second.txt', { type: 'text/plain' })
    const extra = new File(['xx'], 'second.txt', { type: 'text/plain' })
    expect(validateAttachmentFiles([first, second])).toBe(true)
    expect(validateAttachmentFiles([first, extra])).toBe(false)
    expect(validateAttachmentFiles([second, second, second])).toBe(false)
  })

  it('rejects empty or unsupported files', () => {
    expect(
      validateAttachmentFiles([
        new File([], 'empty.txt', { type: 'text/plain' }),
      ]),
    ).toBe(false)
    expect(
      validateAttachmentFiles([
        new File(['x'], 'script.svg', { type: 'image/svg+xml' }),
      ]),
    ).toBe(false)
  })
})
