import type { ChequeWithRelations } from '@/types'
import { localDay, parseCalendarDate } from '@/lib/preference-format'
import type english from '../../../../messages/en.json'

export type ReportPdfLabels = typeof english.Reports.pdfReport

export interface ReportTotals {
  count: number
  inward: number
  outward: number
}

export interface ReportGroup extends ReportTotals {
  id: string
  name: string | null
}

const totals = (): ReportTotals => ({ count: 0, inward: 0, outward: 0 })

function add(target: ReportTotals, cheque: ChequeWithRelations) {
  const key = cheque.type === 'Inward' ? 'inward' : 'outward'
  target.count++
  target[key] += Math.round(cheque.amount * 100)
  if (!Number.isSafeInteger(target[key]))
    throw new Error('Report amount exceeds supported precision')
}

function dayOffset(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function monthOffset(day: string, offset: number) {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

function ranked(groups: Map<string, ReportGroup>) {
  return [...groups.values()].sort(
    (a, b) =>
      b.inward + b.outward - (a.inward + a.outward) || a.id.localeCompare(b.id),
  )
}

/** Amounts are integer hundredths of the user's currency, not payment-provider paise. */
export function buildBusinessOverview(
  cheques: readonly ChequeWithRelations[],
  now: Date,
  timeZone: string,
) {
  if (!cheques.length) throw new Error('No cheques available for this report')
  const today = localDay(now, timeZone)
  const next7 = dayOffset(today, 7)
  const next30 = dayOffset(today, 30)
  const all = totals()
  const pending = totals()
  const cleared = totals()
  const bounced = totals()
  const overdue = totals()
  const dueToday = totals()
  const upcoming7 = totals()
  const upcoming30 = totals()
  const parties = new Map<string, ReportGroup>()
  const banks = new Map<string, ReportGroup>()
  const months = Array.from({ length: 6 }, (_, index) => ({
    month: monthOffset(today, index - 5),
    ...totals(),
  }))
  const previousMonth = { month: monthOffset(today, -2), ...totals() }
  const lastMonth = { month: monthOffset(today, -1), ...totals() }
  const rows = [...cheques].sort(
    (a, b) =>
      a.cheque_date.localeCompare(b.cheque_date) ||
      a.cheque_number.localeCompare(b.cheque_number) ||
      a.id.localeCompare(b.id),
  )
  for (const cheque of rows) {
    if (
      !Number.isFinite(cheque.amount) ||
      cheque.amount < 0 ||
      !Number.isSafeInteger(Math.round(cheque.amount * 100)) ||
      !parseCalendarDate(cheque.cheque_date, 'yyyy-MM-dd') ||
      !['Inward', 'Outward'].includes(cheque.type) ||
      !['Issued', 'Received', 'Cleared', 'Bounced'].includes(cheque.status)
    )
      throw new Error(
        'Report contains an invalid cheque amount, date, or status',
      )
    add(all, cheque)
    const month = cheque.cheque_date.slice(0, 7)
    const bucket = months.find((entry) => entry.month === month)
    if (bucket) add(bucket, cheque)
    if (month === previousMonth.month) add(previousMonth, cheque)
    if (month === lastMonth.month) add(lastMonth, cheque)
    if (cheque.status === 'Cleared') add(cleared, cheque)
    if (cheque.status === 'Bounced') add(bounced, cheque)
    if (cheque.status === 'Issued' || cheque.status === 'Received') {
      add(pending, cheque)
      if (cheque.cheque_date < today) add(overdue, cheque)
      if (cheque.cheque_date === today) add(dueToday, cheque)
      if (cheque.cheque_date > today && cheque.cheque_date <= next7)
        add(upcoming7, cheque)
      if (cheque.cheque_date > today && cheque.cheque_date <= next30)
        add(upcoming30, cheque)
      const party = parties.get(cheque.party_id) ?? {
        id: cheque.party_id,
        name: cheque.party?.name || null,
        ...totals(),
      }
      add(party, cheque)
      parties.set(cheque.party_id, party)
    }
    // Bank names are safe for sharing; account identifiers and names are not exported.
    const bankName = cheque.account?.bank?.name || null
    const bankId = JSON.stringify(bankName)
    const bank = banks.get(bankId) ?? {
      id: bankId,
      name: bankName,
      ...totals(),
    }
    add(bank, cheque)
    banks.set(bankId, bank)
  }
  const comparable = rows[0].cheque_date <= `${previousMonth.month}-01`
  const change = (direction: 'inward' | 'outward') =>
    comparable && previousMonth[direction] > 0
      ? ((lastMonth[direction] - previousMonth[direction]) /
          previousMonth[direction]) *
        100
      : null
  return {
    today,
    firstDate: rows[0].cheque_date,
    lastDate: rows[rows.length - 1].cheque_date,
    all,
    pending,
    cleared,
    bounced,
    overdue,
    dueToday,
    upcoming7,
    upcoming30,
    parties: ranked(parties),
    banks: ranked(banks),
    months,
    previousMonth,
    lastMonth,
    inwardChange: change('inward'),
    outwardChange: change('outward'),
    rows,
  }
}

export type BusinessOverview = ReturnType<typeof buildBusinessOverview>
