import type { ChequeWithRelations } from '@/types'
import { createPreferenceFormatter } from '@/lib/preference-format'
import type { ReportPresentation } from '../repositories/report.repository'

export interface RenderedReport {
  content: BlobPart[]
  type: string
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
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    process(rows.slice(offset, offset + 500), offset)
  }
}

export async function renderCsvReport(
  cheques: readonly ChequeWithRelations[],
): Promise<RenderedReport> {
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
  return { content: parts, type: 'text/csv;charset=utf-8;' }
}

export async function renderJsonReport(
  cheques: readonly ChequeWithRelations[],
): Promise<RenderedReport> {
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
  return { content: parts, type: 'application/json;charset=utf-8;' }
}

export async function renderPdfReport(
  cheques: readonly ChequeWithRelations[],
  presentation?: ReportPresentation,
): Promise<RenderedReport> {
  const { createBusinessOverviewPdf } = await import('./business-overview-pdf')
  const pdf = await createBusinessOverviewPdf(cheques, presentation)
  return { content: [pdf.output('blob')], type: 'application/pdf' }
}

export async function renderExcelReport(
  cheques: readonly ChequeWithRelations[],
  presentation?: ReportPresentation,
): Promise<RenderedReport> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([presentation?.headers ?? headers])
  await eachBatch(cheques, (batch) => {
    XLSX.utils.sheet_add_aoa(
      worksheet,
      batch.map((cheque) => reportCells(cheque, presentation)),
      { origin: -1 },
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
  const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return {
    content: [content],
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}
