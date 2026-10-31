import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readImportFile } from './import-file'

const spreadsheet = vi.hoisted(() => ({
  read: vi.fn(),
  sheetToJson: vi.fn(),
  setCodepage: vi.fn(),
}))
vi.mock('xlsx', () => ({
  read: spreadsheet.read,
  set_cptable: spreadsheet.setCodepage,
  utils: { sheet_to_json: spreadsheet.sheetToJson },
}))
vi.mock('xlsx/dist/cpexcel.full.mjs', () => ({}))

function workbookFile(): File {
  const file = new File(['workbook bytes'], 'upload.xlsx')
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new ArrayBuffer(8),
  })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  spreadsheet.read.mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  })
})

describe('spreadsheet library response boundaries', () => {
  it('rejects workbooks without a first sheet before converting rows', async () => {
    spreadsheet.read.mockReturnValue({ SheetNames: [], Sheets: {} })
    await expect(readImportFile(workbookFile())).rejects.toThrow('file')
    expect(spreadsheet.sheetToJson).not.toHaveBeenCalled()
  })

  it('normalizes missing trailing cells into empty import values', async () => {
    spreadsheet.sheetToJson.mockReturnValue([
      [' name ', '\uFEFFcontact', 'notes'],
      ['Acme', '+919876543210'],
    ])
    await expect(readImportFile(workbookFile())).resolves.toEqual([
      { name: 'Acme', contact: '+919876543210', notes: '' },
    ])
    expect(spreadsheet.sheetToJson).toHaveBeenCalledWith(
      {},
      { header: 1, raw: true, defval: '', blankrows: false },
    )
  })
})
