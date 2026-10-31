import type { ChequeWithRelations } from '@/types'

export interface IReportRepository {
  exportToCSV(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
  exportToJSON(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
  exportToPDF(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
  exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
}

const headers = [
  'Cheque Number',
  'Party',
  'Account',
  'Amount',
  'Date',
  'Type',
  'Status',
  'Notes',
]

function reportCells(cheque: ChequeWithRelations): (string | number)[] {
  return [
    cheque.cheque_number,
    cheque.party?.name || '',
    cheque.account?.bank?.name || '',
    cheque.amount,
    cheque.cheque_date,
    cheque.type,
    cheque.status,
    cheque.notes || '',
  ]
}

async function eachBatch<T>(
  rows: readonly T[],
  process: (batch: readonly T[], offset: number) => void,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 500) {
    // Yield to rendering/input before each bounded formatting batch.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    process(rows.slice(offset, offset + 500), offset)
  }
}

export class BrowserReportRepository implements IReportRepository {
  private download(content: BlobPart[], filename: string, type: string): void {
    const blob = new Blob(content, { type })
    const link = document.createElement('a')
    if (link.download === undefined)
      throw new Error('File downloads are not supported by this browser')
    const url = URL.createObjectURL(blob)
    try {
      link.href = url
      link.download = filename
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
    } finally {
      link.remove()
      URL.revokeObjectURL(url)
    }
  }

  async exportToCSV(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const parts: BlobPart[] = [headers.join(',')]
    await eachBatch(cheques, (batch) => {
      parts.push(
        ...batch.map(
          (cheque) =>
            '\n' +
            reportCells(cheque)
              .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
              .join(','),
        ),
      )
    })
    this.download(parts, filename, 'text/csv;charset=utf-8;')
  }

  async exportToJSON(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const parts: BlobPart[] = ['[\n']
    await eachBatch(cheques, (batch, offset) => {
      batch.forEach((cheque, index) => {
        if (offset + index > 0) parts.push(',\n')
        parts.push(
          JSON.stringify(cheque, null, 2)
            .split('\n')
            .map((line) => '  ' + line)
            .join('\n'),
        )
      })
    })
    parts.push('\n]')
    this.download(parts, filename, 'application/json;charset=utf-8;')
  }

  async exportToPDF(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const { jsPDF } = await import('jspdf')
    const document = new jsPDF()
    document.setFontSize(16)
    document.text('ChequeCheck Report', 14, 18)
    document.setFontSize(9)

    let y = 30
    await eachBatch(cheques, (batch, offset) =>
      batch.forEach((cheque, index) => {
        if (y > 275) {
          document.addPage()
          y = 18
        }
        const line = [
          `#${cheque.cheque_number}`,
          cheque.party?.name || 'Unknown party',
          `${cheque.amount}`,
          cheque.cheque_date,
          cheque.status,
        ].join(' | ')
        document.text(`${offset + index + 1}. ${line}`, 14, y)
        y += 8
      }),
    )

    await document.save(filename, { returnPromise: true })
  }

  async exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([headers])
    await eachBatch(cheques, (batch) => {
      XLSX.utils.sheet_add_aoa(worksheet, batch.map(reportCells), {
        origin: -1,
      })
    })
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cheques')
    XLSX.writeFile(workbook, filename)
  }
}
