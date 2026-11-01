import { describe, expect, it, vi } from 'vitest'
import { defaultPrintLayout, downloadChequePrintPdf } from './print-cheque'
const pdf = vi.hoisted(() => ({
  setFontSize: vi.fn(),
  text: vi.fn(),
  save: vi.fn(),
}))
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      return pdf
    }
  },
}))

describe('cheque print download', () => {
  it('prints dates using the preferred pattern without changing the cheque date', () => {
    const cheque = {
      account_id: 'a1',
      cheque_number: '000001',
      amount: 125.5,
      cheque_date: '2026-10-31',
      party: { name: 'Asha' },
    }
    downloadChequePrintPdf(cheque, '$', defaultPrintLayout, {
      date_format: 'MM/dd/yyyy',
      time_zone: 'America/New_York',
    })
    expect(pdf.text).toHaveBeenCalledWith('10/31/2026', 165, 25)
    expect(cheque.cheque_date).toBe('2026-10-31')
    vi.clearAllMocks()
  })
  it('writes the cheque at configured coordinates and downloads its named PDF', () => {
    downloadChequePrintPdf(
      {
        account_id: 'a1',
        cheque_number: '000001',
        amount: 125.5,
        cheque_date: '2026-10-31',
        party: { name: 'Asha' },
      },
      '$',
      defaultPrintLayout,
    )
    expect(pdf.text.mock.calls).toEqual([
      ['Asha', 35, 55],
      ['$125.5', 150, 55],
      ['2026-10-31', 165, 25],
      ['000001', 165, 35],
    ])
    expect(pdf.save).toHaveBeenCalledWith('cheque-000001.pdf')
  })
})
