import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChequeWithRelations } from '@/types'
import { BrowserReportRepository } from './report.repository'

const pdf = vi.hoisted(() => ({
  setFontSize: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
}))
const excel = vi.hoisted(() => ({
  book_new: vi.fn(() => ({ workbook: true })),
  json_to_sheet: vi.fn(() => ({ sheet: true })),
  book_append_sheet: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      return pdf
    }
  },
}))
vi.mock('xlsx', () => ({ utils: excel, writeFile: excel.writeFile }))

const cheque: ChequeWithRelations = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '000001',
  amount: 125.5,
  cheque_date: '2026-10-31',
  deposit_date: null,
  type: 'Outward',
  status: 'Issued',
  notes: 'Rent',
  image_url: null,
  remind_before_days: null,
  created_at: '',
  updated_at: '',
}
const repository = new BrowserReportRepository()
let downloaded: Blob

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn((blob: Blob) => {
        downloaded = blob
        return 'blob:report'
      }),
      revokeObjectURL: vi.fn(),
    }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('BrowserReportRepository', () => {
  it.each([
    'exportToCSV',
    'exportToJSON',
    'exportToPDF',
    'exportToExcel',
  ] as const)('%s does not create a download for an empty report', (method) => {
    repository[method]([], 'empty')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(pdf.save).not.toHaveBeenCalled()
    expect(excel.writeFile).not.toHaveBeenCalled()
  })

  it('downloads CSV with headers, monetary data, and optional-field fallbacks', async () => {
    repository.exportToCSV([cheque], 'report.csv')
    expect(downloaded.type).toBe('text/csv;charset=utf-8;')
    expect(await readBlob(downloaded)).toBe(
      'Cheque Number,Party,Account,Amount,Date,Type,Status,Notes\n"000001","","","125.5","2026-10-31","Outward","Issued","Rent"',
    )
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })

  it('downloads readable JSON without changing the source records', async () => {
    repository.exportToJSON([cheque], 'report.json')
    expect(downloaded.type).toBe('application/json;charset=utf-8;')
    expect(await readBlob(downloaded)).toBe(JSON.stringify([cheque], null, 2))
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('paginates PDF reports and preserves cheque identifiers and amounts', () => {
    repository.exportToPDF(
      Array.from({ length: 33 }, () => cheque),
      'report.pdf',
    )
    expect(pdf.setFontSize.mock.calls).toEqual([[16], [9]])
    expect(pdf.text).toHaveBeenCalledWith('ChequeCheck Report', 14, 18)
    expect(pdf.text).toHaveBeenCalledWith(
      '1. #000001 | Unknown party | 125.5 | 2026-10-31 | Issued',
      14,
      30,
    )
    expect(pdf.addPage).toHaveBeenCalledOnce()
    expect(pdf.save).toHaveBeenCalledWith('report.pdf')
  })

  it('writes mapped Excel rows to a named worksheet and file', () => {
    repository.exportToExcel([{ ...cheque, notes: null }], 'report.xlsx')
    expect(excel.json_to_sheet).toHaveBeenCalledWith([
      {
        'Cheque Number': '000001',
        Party: '',
        Account: '',
        Amount: 125.5,
        Date: '2026-10-31',
        Type: 'Outward',
        Status: 'Issued',
        Notes: '',
      },
    ])
    expect(excel.book_append_sheet).toHaveBeenCalledWith(
      { workbook: true },
      { sheet: true },
      'Cheques',
    )
    expect(excel.writeFile).toHaveBeenCalledWith(
      { workbook: true },
      'report.xlsx',
    )
  })
})
