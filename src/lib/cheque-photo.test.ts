// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareChequePhoto } from './cheque-photo'
function photo(width = 1000, height = 400) {
  const bytes = new Uint8Array(45)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const data = new DataView(bytes.buffer)
  data.setUint32(8, 13)
  bytes.set([73, 72, 68, 82], 12)
  data.setUint32(16, width)
  data.setUint32(20, height)
  bytes.set([73, 69, 78, 68], 37)
  return new File([bytes], 'source.png', { type: 'image/png' })
}
afterEach(() => vi.unstubAllGlobals())
describe('cheque photo derivative', () => {
  it('decodes orientation and re-encodes instead of uploading source metadata', async () => {
    const close = vi.fn()
    const bitmap = vi
      .fn()
      .mockResolvedValue({ width: 4000, height: 1000, close })
    vi.stubGlobal('createImageBitmap', bitmap)
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage }),
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob(['encoded-jpeg'], { type: 'image/jpeg' })),
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    const source = photo()
    const result = await prepareChequePhoto(source)
    expect(bitmap).toHaveBeenCalledWith(source, {
      imageOrientation: 'from-image',
    })
    expect(canvas.width).toBe(2400)
    expect(canvas.height).toBe(600)
    expect(result.type).toBe('image/jpeg')
    expect(await result.text()).toBe('encoded-jpeg')
    expect(close).toHaveBeenCalledOnce()
  })
  it('rejects excessive pixel dimensions before allocating a decoded image', async () => {
    const bitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', bitmap)
    await expect(prepareChequePhoto(photo(8192, 8192))).rejects.toThrow(
      'INVALID_IMAGE',
    )
    expect(bitmap).not.toHaveBeenCalled()
  })
  it('surfaces encoding failures and releases bitmap resources', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1000, height: 400, close }),
    )
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => null }),
    })
    await expect(prepareChequePhoto(photo())).rejects.toThrow(
      'Unable to prepare',
    )
    expect(close).toHaveBeenCalledOnce()
  })
})
