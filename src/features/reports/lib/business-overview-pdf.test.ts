import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import english from '../../../../messages/en.json'
import hindi from '../../../../messages/hi.json'
import hinglish from '../../../../messages/hi-en.json'
import type { ChequeWithRelations } from '@/types'
import type { ReportPresentation } from '../repositories/report.repository'
import { createBusinessOverviewPdf } from './business-overview-pdf'

const pdf = vi.hoisted(() => ({
  addPage: vi.fn(),
  addImage: vi.fn(),
  setProperties: vi.fn(),
}))
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      return pdf
    }
  },
}))

type DrawnText = { text: string; x: number; y: number; size: number }
let current: DrawnText[] = []
let pages: DrawnText[][] = []
const ctx = {
  font: '',
  fillStyle: '',
  textAlign: 'left',
  textBaseline: 'top',
  scale: vi.fn(),
  measureText(text: string) {
    const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 12)
    return { width: Array.from(text).length * size * 0.6 }
  },
  fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
    if (x === 0 && y === 0 && width === 794 && height === 1123) current = []
  }),
  fillText: vi.fn((text: string, x: number, y: number) => {
    current.push({
      text,
      x,
      y,
      size: Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 12),
    })
  }),
}

const cheque: ChequeWithRelations = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '000001',
  amount: 125.5,
  cheque_date: '2026-11-01',
  deposit_date: null,
  type: 'Outward',
  status: 'Issued',
  notes: 'SECRET internal notes',
  image_url: null,
  remind_before_days: null,
  created_at: '',
  updated_at: '',
  party: { name: 'Acme Customer', contact: 'SECRET contact' },
  account: { account_name: 'SECRET account', bank: { name: 'Example Bank' } },
}
const now = new Date('2026-11-12T12:00:00Z')
const text = () =>
  pages
    .flat()
    .map((entry) => entry.text)
    .join('\n')
function presentation(messages = english, language = 'en'): ReportPresentation {
  return {
    preferences: {
      currency: '€',
      date_format: 'MM/dd/yyyy',
      time_zone: 'Asia/Kolkata',
    },
    language,
    title: messages.Reports.title,
    headers: [],
    sheet: '',
    page: messages.PremiumWorkspace.page,
    unknownParty: messages.Cheques.party,
    statuses: messages.PremiumWorkspace.statuses,
    types: messages.PremiumWorkspace.types,
    pdfLabels: messages.Reports.pdfReport,
    businessName: 'Northstar Traders',
  }
}

beforeEach(() => {
  pages = []
  current = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  pdf.addImage.mockImplementation(() => pages.push([...current]))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('owner overview PDF', () => {
  it('renders branded sections, exact formatted amounts, actions and a private-by-default register', async () => {
    await createBusinessOverviewPdf([cheque], presentation(), now)
    expect(text()).toContain('Northstar Traders')
    expect(text()).toContain('€125.50')
    expect(text()).toContain('11/01/2026')
    expect(text()).toContain('000001')
    expect(text()).toContain('Acme Customer')
    expect(text()).toContain('Example Bank')
    expect(text()).toContain(english.Reports.pdfReport.appendix)
    expect(text()).toContain(english.Reports.pdfReport.methodology)
    expect(text()).toContain('confirm their payment status.')
    expect(text()).not.toContain('SECRET')
    expect(text()).not.toContain(' | ')
    expect(pages.length).toBeGreaterThanOrEqual(4)
    expect(pdf.addPage).toHaveBeenCalledTimes(pages.length - 1)
    expect(pdf.setProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Northstar Traders - Business Cheque Overview',
      }),
    )
    for (const [index, page] of pages.entries())
      expect(page.some((entry) => entry.text === `Page ${index + 1}`)).toBe(
        true,
      )
    for (const entry of pages.flat()) {
      expect(entry.y).toBeGreaterThanOrEqual(40)
      expect(entry.y + entry.size).toBeLessThan(1100)
    }
  })

  it.each([
    [hindi, 'hi'],
    [hinglish, 'hi-en'],
  ])(
    'preserves translated headings and Unicode names',
    async (messages, language) => {
      const input = presentation(messages, language)
      input.businessName = 'व्यापार कंपनी'
      await createBusinessOverviewPdf(
        [{ ...cheque, party: { name: 'शर्मा ट्रेडर्स' }, status: 'Bounced' }],
        input,
        now,
      )
      expect(text()).toContain(input.businessName)
      expect(text()).toContain(messages.Reports.pdfReport.title)
      expect(text()).toContain('शर्मा ट्रेडर्स')
      expect(text()).toContain(messages.PremiumWorkspace.statuses.Bounced)
      expect(text()).toContain('€125.50')
      expect(
        pages
          .flat()
          .some((entry) => /\{(?:count|amount|zone|date)\}/.test(entry.text)),
      ).toBe(false)
    },
  )

  it('renders every register row, repeats table headers and yields on larger histories', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      ...cheque,
      id: `c${index}`,
      cheque_number: String(index).padStart(6, '0'),
    }))
    const timer = vi.spyOn(globalThis, 'setTimeout')
    await createBusinessOverviewPdf(rows, presentation(), now)
    const numbers = pages.flat().filter((entry) => /^\d{6}$/.test(entry.text))
    expect(numbers).toHaveLength(1001)
    expect(new Set(numbers.map((entry) => entry.text)).size).toBe(1001)
    expect(numbers.at(-1)?.text).toBe('001000')
    expect(
      timer.mock.calls.filter((call) => call[1] === 0).length,
    ).toBeGreaterThanOrEqual(10)
    const appendix = pages.filter((page) =>
      page.some((entry) => /^\d{6}$/.test(entry.text)),
    )
    expect(appendix.length).toBeGreaterThan(50)
    for (const page of appendix) {
      expect(
        page.some((entry) => entry.text === english.Reports.pdfReport.number),
      ).toBe(true)
      expect(
        page.some((entry) => entry.text === english.Reports.pdfReport.amount),
      ).toBe(true)
    }
  })

  it('wraps and continues oversized cells across pages without losing names or overlapping the footer', async () => {
    const longName = 'VeryLongPartyName'.repeat(160)
    await createBusinessOverviewPdf(
      [{ ...cheque, party: { name: longName } }],
      presentation(),
      now,
    )
    expect(text()).toContain(english.Reports.pdfReport.continued)
    // The full party name appears once in rankings and once in the register.
    const fragments = pages
      .flat()
      .filter((entry) => /^VeryLong|^[A-Za-z]+$/.test(entry.text))
      .filter(
        (entry) => longName.includes(entry.text) && entry.text.length > 10,
      )
    expect(fragments.map((entry) => entry.text).join('').length).toBe(
      longName.length * 2,
    )
    expect(
      pages
        .flat()
        .filter((entry) => entry.y < 1060)
        .every((entry) => entry.y + entry.size < 1060),
    ).toBe(true)
  })

  it('uses safe defaults, explains empty sections, and does not invent actions', async () => {
    await createBusinessOverviewPdf(
      [{ ...cheque, status: 'Cleared', party: undefined, account: undefined }],
      undefined,
      now,
    )
    expect(text()).toContain(english.Reports.pdfReport.noActions)
    expect(text()).toContain(english.Reports.pdfReport.noPending)
    expect(text()).toContain(english.Reports.pdfReport.unknownBank)
    expect(text()).toContain(english.Reports.pdfReport.unknownParty)
    expect(text()).toContain(english.Reports.pdfReport.unavailable)
  })

  it('ranks the top five parties separately in each direction and declares outward-only scope', async () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      (['Inward', 'Outward'] as const).map((type) => ({
        ...cheque,
        id: `c${index}-${type}`,
        party_id: `p${index}`,
        party: { name: `Party ${index}` },
        type,
        status: type === 'Inward' ? ('Received' as const) : ('Issued' as const),
        amount: type === 'Inward' ? (7 - index) * 10 : index + 1,
      })),
    ).flat()
    await createBusinessOverviewPdf(rows, presentation(), now)
    const lines = pages.flat().map((entry) => entry.text)
    const start = lines.indexOf(english.Reports.pdfReport.topReceive)
    const middle = lines.indexOf(english.Reports.pdfReport.topPay)
    const end = lines.indexOf(english.Reports.pdfReport.bankTitle)
    expect(
      lines.slice(start, middle).filter((line) => /^Party \d$/.test(line)),
    ).toEqual(['Party 0', 'Party 1', 'Party 2', 'Party 3', 'Party 4'])
    expect(
      lines.slice(middle, end).filter((line) => /^Party \d$/.test(line)),
    ).toEqual(['Party 6', 'Party 5', 'Party 4', 'Party 3', 'Party 2'])
    expect(lines.slice(start, middle)).toContain('25%')
    pages = []
    await createBusinessOverviewPdf(
      rows.filter((row) => row.type === 'Outward'),
      { ...presentation(), includeInward: false },
      now,
    )
    expect(text()).toContain(english.Reports.pdfReport.outwardOnly)
  })

  it('propagates unavailable canvas and invalid-data errors', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    await expect(createBusinessOverviewPdf([cheque])).rejects.toThrow(
      'PDF canvas unavailable',
    )
    await expect(createBusinessOverviewPdf([])).rejects.toThrow('No cheques')
    expect(pdf.addImage).not.toHaveBeenCalled()
  })
})
