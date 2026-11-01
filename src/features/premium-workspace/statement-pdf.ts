import { summarizeCheques } from './logic'
import type { ChequeRow } from './types'
import { createPreferenceFormatter } from '@/lib/preference-format'
import { saveTextPdf } from '@/lib/pdf-text'

export interface StatementPdfLabels {
  title: string
  business: string
  party: string
  period: string
  columns: string[]
  totals: string
  inward: string
  outward: string
  pending: string
  netCleared: string
  statuses: Record<string, string>
  types: Record<string, string>
  page: string
}

/** Raster text uses browser fonts so Hindi names and labels survive PDF export without remote fonts. */
export async function downloadStatementPdf(input: {
  business: string
  party: string
  period: string
  cheques: ChequeRow[]
  currency: string
  locale: string
  dateFormat?: string
  labels: StatementPdfLabels
}): Promise<void> {
  const labels = input.labels
  const display = createPreferenceFormatter(
    { date_format: input.dateFormat },
    input.locale,
  )
  const money = (amount: number) =>
    display.currency(amount, input.currency, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  const summary = summarizeCheques(input.cheques)
  const lines: string[] = []
  const addLine = (text: string) => {
    lines.push(text)
  }
  addLine(labels.title)
  addLine(`${labels.business}: ${input.business}`)
  addLine(`${labels.party}: ${input.party}`)
  addLine(`${labels.period}: ${input.period}`)
  addLine('')
  addLine(labels.columns.join(' | '))
  let balance = 0
  for (const c of input.cheques) {
    if (c.status === 'Cleared')
      balance +=
        Math.round((c.amount ?? 0) * 100) * (c.type === 'Inward' ? 1 : -1)
    addLine(
      [
        c.cheque_date ? display.date(c.cheque_date) : '',
        c.cheque_number ?? '',
        money(c.amount ?? 0),
        labels.types[c.type ?? ''] ?? '',
        labels.statuses[c.status ?? ''] ?? '',
        money(balance / 100),
      ].join(' | '),
    )
  }
  addLine('')
  addLine(`${labels.totals}: ${input.cheques.length}`)
  addLine(
    `${labels.inward}: ${money(summary.inward)} | ${labels.outward}: ${money(summary.outward)}`,
  )
  addLine(
    `${labels.pending}: ${money(summary.pending)} | ${labels.netCleared}: ${money(summary.netCleared)}`,
  )
  await saveTextPdf(
    lines,
    `party-statement-${new Date().toISOString().slice(0, 10)}.pdf`,
    labels.page,
  )
}
