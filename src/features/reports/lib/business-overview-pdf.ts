import { jsPDF } from 'jspdf'
import english from '../../../../messages/en.json'
import type { ChequeWithRelations } from '@/types'
import { createPreferenceFormatter } from '@/lib/preference-format'
import type { ReportPresentation } from '../repositories/report.repository'
import {
  buildBusinessOverview,
  type ReportPdfLabels,
  type ReportTotals,
} from './business-overview'

const WIDTH = 794
const HEIGHT = 1123
const MARGIN = 48
const CONTENT = WIDTH - MARGIN * 2
const BOTTOM = 1040
const BLUE = '#0066cc'
const INK = '#1d1d1f'
const MUTED = '#626974'
const PALE = '#f3f6fa'
const FONT = 'system-ui, -apple-system, "Noto Sans Devanagari", sans-serif'

function interpolate(text: string, values: Record<string, string>) {
  return text.replace(
    /\{(\w+)\}/g,
    (_, key: string) => values[key] ?? `{${key}}`,
  )
}

class ReportLayout {
  readonly canvas = document.createElement('canvas')
  readonly ctx: CanvasRenderingContext2D
  y = 0
  private pageNumber = 0
  private section = ''
  private readonly graphemes = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
  })

  constructor(
    readonly pdf: jsPDF,
    private labels: ReportPdfLabels,
    private business: string,
    private prepared: string,
  ) {
    this.canvas.width = WIDTH * 2
    this.canvas.height = HEIGHT * 2
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('PDF canvas unavailable')
    this.ctx = ctx
    ctx.scale(2, 2)
    ctx.textBaseline = 'top'
  }

  font(size: number, weight = 400) {
    this.ctx.font = `${weight} ${size}px ${FONT}`
  }

  lines(text: string, width: number, size = 12, weight = 400): string[] {
    this.font(size, weight)
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const word of paragraph.split(/(\s+)/)) {
        if (this.ctx.measureText(line + word).width <= width) {
          line += word
          continue
        }
        if (line.trim()) lines.push(line.trimEnd())
        line = ''
        for (const { segment: character } of this.graphemes.segment(
          word.trimStart(),
        )) {
          if (this.ctx.measureText(line + character).width > width && line) {
            lines.push(line)
            line = ''
          }
          line += character
        }
      }
      lines.push(line.trimEnd())
    }
    return lines
  }

  text(
    text: string,
    x: number,
    y: number,
    size = 12,
    color = INK,
    weight = 400,
    align: CanvasTextAlign = 'left',
  ) {
    this.font(size, weight)
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.fillText(text, x, y)
    this.ctx.textAlign = 'left'
  }

  private short(text: string, width: number, size: number) {
    this.font(size)
    if (this.ctx.measureText(text).width <= width) return text
    let result = ''
    for (const { segment: char } of this.graphemes.segment(text)) {
      if (this.ctx.measureText(result + char + '...').width > width) break
      result += char
    }
    return result + '...'
  }

  finish() {
    if (!this.pageNumber) return
    this.ctx.fillStyle = '#dfe4eb'
    this.ctx.fillRect(MARGIN, 1060, CONTENT, 1)
    this.text(`ChequeCheck  /  ${this.labels.footer}`, MARGIN, 1075, 10, MUTED)
    this.text(
      `${this.labels.page} ${this.pageNumber}`,
      WIDTH - MARGIN,
      1075,
      10,
      MUTED,
      400,
      'right',
    )
    this.pdf.addImage(this.canvas, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  }

  page(section = this.section) {
    if (this.pageNumber) {
      this.finish()
      this.pdf.addPage()
    }
    this.pageNumber++
    this.section = section
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT)
    this.ctx.fillStyle = BLUE
    this.ctx.fillRect(MARGIN, 40, 30, 4)
    this.text('ChequeCheck', MARGIN, 57, 12, BLUE, 600)
    this.text(this.prepared, WIDTH - MARGIN, 57, 10, MUTED, 400, 'right')
    this.text(this.short(section, CONTENT, 26), MARGIN, 88, 26, INK, 600)
    this.text(this.short(this.business, CONTENT, 12), MARGIN, 126, 12, MUTED)
    this.y = 164
  }

  ensure(height: number) {
    if (this.y + height > BOTTOM) this.page()
  }

  paragraph(text: string, size = 12, color = MUTED, weight = 400) {
    const lineHeight = size * 1.65
    for (const line of this.lines(text, CONTENT, size, weight)) {
      this.ensure(lineHeight)
      this.text(line, MARGIN, this.y, size, color, weight)
      this.y += lineHeight
    }
    this.y += 10
  }

  heading(text: string) {
    this.ensure(85)
    this.y += 15
    this.paragraph(text, 16, INK, 600)
  }

  cards(items: { label: string; value: string; help: string }[]) {
    const gap = 16
    const width = (CONTENT - gap) / 2
    const data = items.map((item) => ({
      ...item,
      labelLines: this.lines(item.label, width - 36, 12, 600),
      valueLines: this.lines(item.value, width - 36, 25, 600),
      helpLines: this.lines(item.help, width - 36, 11),
    }))
    const height = Math.max(
      ...data.map(
        (item) =>
          44 +
          item.labelLines.length * 20 +
          item.valueLines.length * 36 +
          item.helpLines.length * 18,
      ),
    )
    this.ensure(height + 16)
    data.forEach((item, index) => {
      const x = MARGIN + index * (width + gap)
      this.ctx.fillStyle = PALE
      this.ctx.fillRect(x, this.y, width, height)
      this.ctx.fillStyle = BLUE
      this.ctx.fillRect(x, this.y, 3, height)
      let top = this.y + 20
      for (const line of item.labelLines) {
        this.text(line, x + 18, top, 12, MUTED, 600)
        top += 20
      }
      top += 7
      for (const line of item.valueLines) {
        this.text(line, x + 18, top, 25, INK, 600)
        top += 36
      }
      for (const line of item.helpLines) {
        this.text(line, x + 18, top, 11, MUTED)
        top += 18
      }
    })
    this.y += height + 16
  }

  async table(
    headers: string[],
    widths: number[],
    rows: Iterable<string[]>,
    numericColumns: number[] = [],
  ) {
    const lineHeight = 19
    const padding = 10
    const headerLines = headers.map((header, i) =>
      this.lines(header, widths[i] - padding * 2, 11, 600),
    )
    const headerHeight =
      Math.max(...headerLines.map((lines) => lines.length)) * 18 + 20
    const drawHeader = () => {
      this.ctx.fillStyle = PALE
      this.ctx.fillRect(MARGIN, this.y, CONTENT, headerHeight)
      let x = MARGIN
      headerLines.forEach((lines, i) => {
        lines.forEach((line, j) =>
          this.text(
            line,
            numericColumns.includes(i) ? x + widths[i] - padding : x + padding,
            this.y + padding + j * 18,
            11,
            MUTED,
            600,
            numericColumns.includes(i) ? 'right' : 'left',
          ),
        )
        x += widths[i]
      })
      this.y += headerHeight
    }
    const nextPage = async (continued = false) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      this.page()
      if (continued) {
        this.text(this.labels.continued, MARGIN, this.y, 10, MUTED)
        this.y += 20
      }
      drawHeader()
    }
    this.ensure(headerHeight + lineHeight + padding * 2)
    drawHeader()
    let rowIndex = 0
    for (const row of rows) {
      const cells = row.map((cell, i) =>
        this.lines(cell, widths[i] - padding * 2, 12),
      )
      const length = Math.max(...cells.map((lines) => lines.length))
      const fullHeight = length * lineHeight + padding * 2
      if (this.y + fullHeight > BOTTOM && this.y > 164 + headerHeight) {
        await nextPage()
      }
      let offset = 0
      while (offset < length) {
        const capacity = Math.floor(
          (BOTTOM - this.y - padding * 2) / lineHeight,
        )
        if (capacity < 1) {
          await nextPage()
          continue
        }
        const take = Math.min(capacity, length - offset)
        const height = take * lineHeight + padding * 2
        if (rowIndex % 2 === 1) {
          this.ctx.fillStyle = '#fafbfc'
          this.ctx.fillRect(MARGIN, this.y, CONTENT, height)
        }
        let x = MARGIN
        cells.forEach((lines, i) => {
          lines
            .slice(offset, offset + take)
            .forEach((line, j) =>
              this.text(
                line,
                numericColumns.includes(i)
                  ? x + widths[i] - padding
                  : x + padding,
                this.y + padding + j * lineHeight,
                12,
                INK,
                400,
                numericColumns.includes(i) ? 'right' : 'left',
              ),
            )
          x += widths[i]
        })
        this.y += height
        this.ctx.fillStyle = '#e8ecf1'
        this.ctx.fillRect(MARGIN, this.y - 1, CONTENT, 1)
        offset += take
        if (offset < length) {
          await nextPage(true)
        }
      }
      rowIndex++
      // Yield between bounded formatting batches to keep the export UI responsive.
      if (rowIndex % 100 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    this.y += 12
  }
}

export async function createBusinessOverviewPdf(
  cheques: readonly ChequeWithRelations[],
  presentation?: ReportPresentation,
  now = new Date(),
): Promise<jsPDF> {
  const labels = presentation?.pdfLabels ?? english.Reports.pdfReport
  const display = createPreferenceFormatter(
    presentation?.preferences,
    presentation?.language,
  )
  const model = buildBusinessOverview(cheques, now, display.timeZone)
  const money = (minor: number) =>
    display.currency(minor / 100, undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  const count = (value: number) => display.number(value)
  const month = (value: string) =>
    new Intl.DateTimeFormat(display.locale, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}-01T00:00:00Z`))
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const business = presentation?.businessName || labels.unavailableBusiness
  pdf.setProperties({
    title: `${business} - ${labels.title}`,
    creator: 'ChequeCheck',
  })
  await document.fonts?.ready
  const layout = new ReportLayout(
    pdf,
    labels,
    business,
    interpolate(labels.generated, { date: display.dateTime(now) }),
  )
  const totalsRow = (title: string, totals: ReportTotals) => [
    title,
    count(totals.count),
    money(totals.inward),
    money(totals.outward),
  ]
  const totalHeaders = [
    labels.window,
    labels.count,
    labels.inward,
    labels.outward,
  ]
  const totalWidths = [274, 64, 180, 180]

  layout.page(labels.title)
  layout.paragraph(business, 23, INK, 600)
  layout.paragraph(
    `${labels.allHistory}  /  ${interpolate(labels.recorded, { count: count(model.all.count) })}`,
    12,
    BLUE,
    600,
  )
  layout.paragraph(
    interpolate(labels.coverage, {
      from: display.date(model.firstDate),
      to: display.date(model.lastDate),
    }),
  )
  layout.paragraph(labels.scope, 11)
  if (presentation?.includeInward === false)
    layout.paragraph(labels.outwardOnly, 11, BLUE)
  layout.heading(labels.executive)
  layout.cards([
    {
      label: labels.receivable,
      value: money(model.pending.inward),
      help: labels.pending,
    },
    {
      label: labels.payable,
      value: money(model.pending.outward),
      help: labels.pending,
    },
  ])
  layout.paragraph(
    interpolate(labels.summary, {
      receive: money(model.pending.inward),
      pay: money(model.pending.outward),
      count: count(model.pending.count),
    }),
    12,
    INK,
  )
  await layout.table(
    [labels.netPending, labels.clearedIn, labels.clearedOut],
    [258, 220, 220],
    [
      [
        money(model.pending.inward - model.pending.outward),
        money(model.cleared.inward),
        money(model.cleared.outward),
      ],
    ],
    [0, 1, 2],
  )
  layout.paragraph(labels.netHelp, 11)
  layout.heading(labels.attention)
  await layout.table(
    totalHeaders,
    totalWidths,
    [
      totalsRow(labels.overdue, model.overdue),
      totalsRow(labels.dueToday, model.dueToday),
      totalsRow(labels.next7, model.upcoming7),
      totalsRow(labels.next30, model.upcoming30),
      totalsRow(labels.bounced, model.bounced),
    ],
    [1, 2, 3],
  )
  layout.paragraph(labels.windowsHelp, 10)
  layout.paragraph(
    interpolate(labels.bouncedHelp, { count: count(model.bounced.count) }),
    10,
  )
  layout.page(labels.relationships)
  layout.heading(labels.actions)
  const actions: string[] = []
  if (model.overdue.inward)
    actions.push(
      interpolate(labels.collect, { amount: money(model.overdue.inward) }),
    )
  if (model.overdue.outward)
    actions.push(
      interpolate(labels.reviewOverduePay, {
        amount: money(model.overdue.outward),
      }),
    )
  const nearTerm = model.dueToday.outward + model.upcoming7.outward
  if (nearTerm)
    actions.push(interpolate(labels.prepare, { amount: money(nearTerm) }))
  if (model.bounced.count)
    actions.push(
      interpolate(labels.recover, { count: count(model.bounced.count) }),
    )
  for (const action of actions.length ? actions : [labels.noActions])
    layout.paragraph(action, 12, INK)

  layout.paragraph(labels.topHelp, 11)
  for (const direction of ['inward', 'outward'] as const) {
    layout.heading(direction === 'inward' ? labels.topReceive : labels.topPay)
    const parties = [...model.parties]
      .filter((party) => party[direction] > 0)
      .sort((a, b) => b[direction] - a[direction] || a.id.localeCompare(b.id))
      .slice(0, 5)
    if (!parties.length) {
      layout.paragraph(labels.noPending)
      continue
    }
    await layout.table(
      [labels.party, labels.amount, labels.share],
      [338, 220, 140],
      parties.map((party) => [
        party.name ?? labels.unknownParty,
        money(party[direction]),
        display.number(party[direction] / model.pending[direction], {
          style: 'percent',
          maximumFractionDigits: 1,
        }),
      ]),
      [1, 2],
    )
  }
  layout.heading(labels.bankTitle)
  layout.paragraph(labels.bankHelp, 11)
  await layout.table(
    [labels.bank, labels.count, labels.inward, labels.outward],
    totalWidths,
    model.banks.map((bank) => totalsRow(bank.name ?? labels.unknownBank, bank)),
    [1, 2, 3],
  )

  layout.page(labels.trends)
  layout.heading(labels.monthly)
  layout.paragraph(labels.trendHelp, 11)
  layout.ensure(220)
  const chartTop = layout.y
  const maximum = Math.max(
    1,
    ...model.months.flatMap((m) => [m.inward, m.outward]),
  )
  const groupWidth = CONTENT / model.months.length
  model.months.forEach((entry, index) => {
    const x = MARGIN + index * groupWidth
    for (const [direction, offset, color] of [
      ['inward', 22, BLUE],
      ['outward', 52, '#8391a5'],
    ] as const) {
      const height = (entry[direction] / maximum) * 130
      layout.ctx.fillStyle = color
      layout.ctx.fillRect(x + offset, chartTop + 140 - height, 24, height)
    }
    layout.text(
      month(entry.month),
      x + groupWidth / 2,
      chartTop + 155,
      10,
      MUTED,
      400,
      'center',
    )
  })
  layout.y += 190
  layout.text(labels.inward, MARGIN, layout.y, 11, BLUE, 600)
  layout.text(
    labels.outward,
    MARGIN + CONTENT / 2,
    layout.y,
    11,
    '#637187',
    600,
  )
  layout.y += 28
  await layout.table(
    [labels.month, labels.count, labels.inward, labels.outward],
    totalWidths,
    model.months.map((entry) => totalsRow(month(entry.month), entry)),
    [1, 2, 3],
  )
  layout.heading(labels.comparison)
  layout.paragraph(
    `${labels.previous}: ${month(model.previousMonth.month)}  /  ${labels.latest}: ${month(model.lastMonth.month)}`,
    11,
  )
  await layout.table(
    [labels.direction, labels.previous, labels.latest, labels.change],
    [178, 180, 180, 160],
    (['inward', 'outward'] as const).map((direction) => {
      const change =
        direction === 'inward' ? model.inwardChange : model.outwardChange
      return [
        labels[direction],
        money(model.previousMonth[direction]),
        money(model.lastMonth[direction]),
        change === null
          ? labels.unavailable
          : display.number(change / 100, {
              style: 'percent',
              maximumFractionDigits: 1,
              signDisplay: 'exceptZero',
            }),
      ]
    }),
    [1, 2, 3],
  )
  layout.paragraph(labels.comparisonHelp, 10)
  layout.page(labels.appendix)
  layout.paragraph(labels.appendixHelp, 11)
  const statuses = presentation?.statuses ?? english.PremiumWorkspace.statuses
  const types = presentation?.types ?? english.PremiumWorkspace.types
  function* registerRows() {
    for (const cheque of model.rows) {
      yield [
        `${cheque.cheque_number}\n${display.date(cheque.cheque_date)}`,
        cheque.party?.name || labels.unknownParty,
        cheque.account?.bank?.name || labels.unknownBank,
        `${types[cheque.type]}\n${statuses[cheque.status]}`,
        money(Math.round(cheque.amount * 100)),
      ]
    }
  }
  await layout.table(
    [
      `${labels.number}\n${labels.date}`,
      labels.party,
      labels.bank,
      labels.directionStatus,
      labels.amount,
    ],
    [120, 166, 142, 128, 142],
    registerRows(),
    [4],
  )
  layout.heading(labels.methodology)
  layout.paragraph(
    interpolate(labels.methodologyText, { zone: display.timeZone }),
    11,
  )
  layout.heading(labels.privacy)
  layout.paragraph(labels.privacyText, 11)
  layout.finish()
  return pdf
}
