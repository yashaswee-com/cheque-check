import type { ChequeWithRelations } from '@/types'
import {
  createPreferenceFormatter,
  type FormattingPreferences,
} from '@/lib/preference-format'
import type { ReportPdfLabels } from '../lib/business-overview'

export interface ReportPresentation {
  businessName?: string
  pdfLabels?: ReportPdfLabels
  includeInward?: boolean
  preferences: FormattingPreferences | null
  language: string
  title: string
  headers: string[]
  sheet: string
  page: string
  unknownParty: string
  statuses: Record<string, string>
  types: Record<string, string>
}

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
    presentation?: ReportPresentation,
  ): Promise<void>
  exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
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

function reportCells(
  cheque: ChequeWithRelations,
  presentation?: ReportPresentation,
): (string | number)[] {
  const display = createPreferenceFormatter(
    presentation?.preferences,
    presentation?.language,
  )
  return [
    cheque.cheque_number,
    cheque.party?.name || '',
    cheque.account?.bank?.name || '',
    cheque.amount,
    presentation ? display.date(cheque.cheque_date) : cheque.cheque_date,
    presentation ? presentation.types[cheque.type] : cheque.type,
    presentation ? presentation.statuses[cheque.status] : cheque.status,
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
    presentation?: ReportPresentation,
  ): Promise<void> {
    if (cheques.length === 0)
      throw new Error(
        presentation?.pdfLabels?.empty ??
          'No cheques available for this report.',
      )
    const { createBusinessOverviewPdf } =
      await import('../lib/business-overview-pdf')
    const pdf = await createBusinessOverviewPdf(cheques, presentation)
    await pdf.save(filename, { returnPromise: true })
  }

  async exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
  ): Promise<void> {
    if (cheques.length === 0) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      presentation?.headers ?? headers,
    ])
    await eachBatch(cheques, (batch) => {
      XLSX.utils.sheet_add_aoa(
        worksheet,
        batch.map((cheque) => reportCells(cheque, presentation)),
        {
          origin: -1,
        },
      )
    })
    if (presentation) {
      for (let row = 1; row <= cheques.length; row++) {
        worksheet[`D${row + 1}`].z =
          `"${presentation.preferences?.currency || '₹'}"#,##0.00`
      }
    }
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      presentation?.sheet ?? 'Cheques',
    )
    XLSX.writeFile(workbook, filename)
  }
}
