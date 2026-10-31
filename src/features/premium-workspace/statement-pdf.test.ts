import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadStatementPdf, type StatementPdfLabels } from './statement-pdf'
import type { ChequeRow } from './types'

const pdf = vi.hoisted(() => ({
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
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
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  fillRect: vi.fn(),
  fillText: vi.fn(),
}
const labels: StatementPdfLabels = {
  title: 'Statement',
  business: 'Business',
  party: 'Party',
  period: 'Period',
  columns: ['Date', 'Number', 'Amount', 'Type', 'Status', 'Balance'],
  totals: 'Total',
  inward: 'Inward',
  outward: 'Outward',
  pending: 'Pending',
  netCleared: 'Net',
  statuses: { Cleared: 'Cleared', Issued: 'Issued' },
  types: { Inward: 'Inward', Outward: 'Outward' },
  page: 'Page',
}
function cheque(overrides: Partial<ChequeRow> = {}): ChequeRow {
  return {
    id: 'c1',
    business_id: 'b1',
    party_id: 'p1',
    account_id: 'a1',
    cheque_number: '000001',
    amount: 125.5,
    cheque_date: '2026-10-31',
    deposit_date: null,
    type: 'Inward',
    status: 'Cleared',
    notes: null,
    image_url: null,
    is_draft: false,
    remind_before_days: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    deletion_batch_id: null,
    ...overrides,
  }
}
const input = {
  business: 'Example',
  party: 'Asha',
  period: 'October',
  cheques: [cheque()],
  currency: '$',
  locale: 'en-US',
  labels,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,test',
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('statement PDF export', () => {
  it('renders headings, decimal balances, and totals into a browser-font PDF', async () => {
    await downloadStatementPdf({
      ...input,
      cheques: [
        cheque(),
        cheque({ type: 'Outward', amount: 25.25 }),
        cheque({ status: 'Issued', amount: 7 }),
      ],
    })
    const text = ctx.fillText.mock.calls.map(([line]) => line)
    expect(text).toContain('Business: Example')
    expect(text).toContain('Party: Asha')
    expect(text).toContain('Period: October')
    expect(text).toContain(
      '2026-10-31 | 000001 | $125.50 | Inward | Cleared | $125.50',
    )
    expect(text).toContain(
      '2026-10-31 | 000001 | $25.25 | Outward | Cleared | $100.25',
    )
    expect(text).toContain(
      '2026-10-31 | 000001 | $7.00 | Inward | Issued | $100.25',
    )
    expect(text).toContain('Total: 3')
    expect(text).toContain('Page 1 / 1')
    expect(pdf.addImage).toHaveBeenCalledWith(
      'data:image/png;base64,test',
      'PNG',
      0,
      0,
      210,
      297,
    )
    expect(pdf.save).toHaveBeenCalledWith('party-statement-2026-10-31.pdf')
  })

  it('wraps long unbroken names and adds pages without losing text', async () => {
    await downloadStatementPdf({
      ...input,
      party: 'A'.repeat(160),
      cheques: Array.from({ length: 50 }, () => cheque()),
    })
    expect(pdf.addPage).toHaveBeenCalled()
    expect(pdf.addImage).toHaveBeenCalledTimes(2)
    const lines = ctx.fillText.mock.calls.map(([line]) => line)
    expect(lines.filter((line) => line.includes('000001'))).toHaveLength(50)
    expect(lines).toContain('Page 2 / 2')
    expect(lines.some((line) => line === 'A'.repeat(56))).toBe(true)
  })

  it('exports an empty statement with zero totals', async () => {
    await downloadStatementPdf({ ...input, cheques: [] })
    expect(ctx.fillText).toHaveBeenCalledWith(
      'Total: 0',
      60,
      expect.any(Number),
    )
    expect(ctx.fillText).toHaveBeenCalledWith(
      'Pending: $0.00 | Net: $0.00',
      60,
      expect.any(Number),
    )
    expect(pdf.save).toHaveBeenCalledOnce()
  })

  it('rejects explicitly if browser canvas rendering is unavailable', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    await expect(downloadStatementPdf(input)).rejects.toThrow(
      'PDF canvas unavailable',
    )
    expect(pdf.save).not.toHaveBeenCalled()
  })
})
