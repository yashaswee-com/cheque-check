import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { jsPDF } from 'jspdf'
import { addPdfText, saveTextPdf } from './pdf-text'

const pdf = vi.hoisted(() => ({
  text: vi.fn(),
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      return pdf
    }
  },
}))
const ctx = {
  font: '',
  fillStyle: '',
  measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
  fillRect: vi.fn(),
  fillText: vi.fn(),
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,test',
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('localized PDF text', () => {
  it('retains native PDF text for ASCII and rasterizes Hindi and currency glyphs at the requested position', () => {
    addPdfText(pdf as unknown as jsPDF, 'Cheque', 10, 20)
    expect(pdf.text).toHaveBeenCalledWith('Cheque', 10, 20)
    addPdfText(pdf as unknown as jsPDF, 'राशि ₹100', 30, 40)
    expect(ctx.fillText).toHaveBeenCalledWith('राशि ₹100', 4, 44)
    const [, type, x, y, width, height] = pdf.addImage.mock.calls[0]
    expect(type).toBe('PNG')
    expect(x).toBe(30)
    expect(y).toBeCloseTo(40 - (11 * 25.4) / 72)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('paginates localized output and awaits save failures rather than reporting success', async () => {
    await saveTextPdf(
      Array.from({ length: 43 }, () => 'राशि €100'),
      'report.pdf',
      'पृष्ठ',
    )
    expect(pdf.addPage).toHaveBeenCalledOnce()
    expect(pdf.addImage).toHaveBeenCalledTimes(2)
    expect(ctx.fillText).toHaveBeenCalledWith('पृष्ठ 2 / 2', 60, 1685)
    expect(pdf.save).toHaveBeenCalledWith('report.pdf', { returnPromise: true })
    pdf.save.mockRejectedValueOnce(new Error('Save failed'))
    await expect(saveTextPdf(['£100'], 'failed.pdf', 'Page')).rejects.toThrow(
      'Save failed',
    )
  })

  it('explicitly rejects unavailable canvas rendering', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(() => addPdfText(pdf as unknown as jsPDF, '₹100', 0, 0)).toThrow(
      'PDF canvas unavailable',
    )
    await expect(saveTextPdf(['₹100'], 'report.pdf', 'Page')).rejects.toThrow(
      'PDF canvas unavailable',
    )
  })
})
