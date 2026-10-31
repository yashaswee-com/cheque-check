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
  aoa_to_sheet: vi.fn(() => ({ sheet: true })),
  sheet_add_aoa: vi.fn(),
  book_append_sheet: vi.fn(),
  writeFile: vi.fn(),
}))
const loaded = vi.hoisted(() => ({ pdf: vi.fn(), excel: vi.fn() }))
vi.mock('jspdf', () => {
  loaded.pdf()
  return {
    jsPDF: class {
      constructor() {
        return pdf
      }
    },
  }
})
vi.mock('xlsx', () => {
  loaded.excel()
  return { utils: excel, writeFile: excel.writeFile }
})

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
  it('does not load PDF or Excel dependencies for CSV and JSON exports', async () => {
    await repository.exportToCSV([cheque], 'report.csv')
    await repository.exportToJSON([cheque], 'report.json')
    expect(loaded.pdf).not.toHaveBeenCalled()
    expect(loaded.excel).not.toHaveBeenCalled()
  })
  it.each([
    'exportToCSV',
    'exportToJSON',
    'exportToPDF',
    'exportToExcel',
  ] as const)(
    '%s does not create a download for an empty report',
    async (method) => {
      await repository[method]([], 'empty')
      expect(URL.createObjectURL).not.toHaveBeenCalled()
      expect(pdf.save).not.toHaveBeenCalled()
      expect(excel.writeFile).not.toHaveBeenCalled()
    },
  )

  it('downloads CSV with headers, monetary data, and optional-field fallbacks', async () => {
    await repository.exportToCSV([cheque], 'report.csv')
    expect(downloaded.type).toBe('text/csv;charset=utf-8;')
    expect(await readBlob(downloaded)).toBe(
      'Cheque Number,Party,Account,Amount,Date,Type,Status,Notes\n"000001","","","125.5","2026-10-31","Outward","Issued","Rent"',
    )
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })

  it('downloads readable JSON without changing the source records', async () => {
    await repository.exportToJSON([cheque], 'report.json')
    expect(downloaded.type).toBe('application/json;charset=utf-8;')
    expect(await readBlob(downloaded)).toBe(JSON.stringify([cheque], null, 2))
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('paginates PDF reports and preserves cheque identifiers and amounts', async () => {
    await repository.exportToPDF(
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
    expect(pdf.save).toHaveBeenCalledWith('report.pdf', { returnPromise: true })
  })

  it('writes mapped Excel rows to a named worksheet and file', async () => {
    await repository.exportToExcel([{ ...cheque, notes: null }], 'report.xlsx')
    expect(excel.aoa_to_sheet).toHaveBeenCalledWith([
      [
        'Cheque Number',
        'Party',
        'Account',
        'Amount',
        'Date',
        'Type',
        'Status',
        'Notes',
      ],
    ])
    expect(excel.sheet_add_aoa).toHaveBeenCalledWith(
      { sheet: true },
      [['000001', '', '', 125.5, '2026-10-31', 'Outward', 'Issued', '']],
      { origin: -1 },
    )
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

  it('escapes quotes, commas and embedded newlines without altering text', async () => {
    await repository.exportToCSV(
      [{ ...cheque, notes: 'Paid "Acme, Inc."\nThanks' }],
      'quoted.csv',
    )
    expect(await readBlob(downloaded)).toContain(
      '"Paid ""Acme, Inc.""\nThanks"',
    )
  })

  it.each(['exportToCSV', 'exportToJSON'] as const)(
    '%s includes 10,000 records across formatting batches without duplicates',
    async (method) => {
      const rows = Array.from({ length: 10000 }, (_, index) => ({
        ...cheque,
        id: `cheque-${index}`,
        cheque_number: String(index).padStart(6, '0'),
      }))
      await repository[method](rows, 'complete')
      const content = await readBlob(downloaded)
      if (method === 'exportToJSON') {
        expect(JSON.parse(content)).toEqual(rows)
      } else {
        const lines = content.split('\n')
        expect(lines).toHaveLength(10001)
        expect(
          new Set(lines.slice(1).map((line) => line.split(',')[0])).size,
        ).toBe(10000)
        expect(lines.at(-1)).toContain('"009999"')
      }
    },
  )

  it('yields before formatting and keeps Excel batches at most 500 rows', async () => {
    const rows = Array.from({ length: 1001 }, () => cheque)
    const promise = repository.exportToExcel(rows, 'bounded.xlsx')
    expect(excel.sheet_add_aoa).not.toHaveBeenCalled()
    await promise
    expect(
      excel.sheet_add_aoa.mock.calls.map((call) => call[1].length),
    ).toEqual([500, 500, 1])
  })

  it('cleans up the anchor and blob URL when download initiation throws', async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
      throw new Error('Download blocked')
    })
    await expect(
      repository.exportToCSV([cheque], 'blocked.csv'),
    ).rejects.toThrow('Download blocked')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })

  it('propagates asynchronous PDF save failures', async () => {
    pdf.save.mockRejectedValueOnce(new Error('Save failed'))
    await expect(
      repository.exportToPDF([cheque], 'blocked.pdf'),
    ).rejects.toThrow('Save failed')
  })
  it('preserves numbering and pagination across PDF formatting batches', async () => {
    await repository.exportToPDF(
      Array.from({ length: 1001 }, () => cheque),
      'complete.pdf',
    )
    expect(
      pdf.text.mock.calls.filter((call) => /^\d+\./.test(call[0])),
    ).toHaveLength(1001)
    expect(pdf.text).toHaveBeenCalledWith(
      expect.stringContaining('1001. #000001'),
      14,
      expect.any(Number),
    )
  })
})
