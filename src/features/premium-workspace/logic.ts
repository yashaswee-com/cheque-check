import type {
  ChequeFilters,
  ChequeRow,
  ImportKind,
  ImportRow,
  PreviewRow,
  SafeChequePrefill,
  WorkspaceContext,
} from './types'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { chequeSchema } from '@/validators'
import {
  importPartyValidators,
  importChequeValidators,
  validDate,
  validAmount,
} from '@/validators/premium-workspace'
export { validDate, validAmount } from '@/validators/premium-workspace'

export const placeholders = [
  'party',
  'cheque_number',
  'amount',
  'date',
  'status',
  'business',
] as const
export type MessageValues = Record<(typeof placeholders)[number], string>

export function isValidMessageTemplate(body: string): boolean {
  return (
    body.trim().length > 0 &&
    body.length <= 2000 &&
    !/[{}]/.test(
      body.replace(
        /\{(party|cheque_number|amount|date|status|business)\}/g,
        '',
      ),
    )
  )
}

export function renderMessageTemplate(
  body: string,
  values: MessageValues,
): string {
  if (!isValidMessageTemplate(body)) throw new Error('Invalid message template')
  // Replace once: braces in user-supplied names must never become new placeholders.
  return body.replace(
    /\{(party|cheque_number|amount|date|status|business)\}/g,
    (_, key: keyof MessageValues) => values[key],
  )
}

export function safeChequePrefill(
  source: Record<string, unknown>,
): SafeChequePrefill {
  const result: SafeChequePrefill = {}
  if (typeof source.party_id === 'string' && source.party_id)
    result.party_id = source.party_id
  if (typeof source.account_id === 'string' && source.account_id)
    result.account_id = source.account_id
  const amount = Number(source.amount)
  if (validAmount(source.amount) && amount > 0) result.amount = amount
  const type = chequeSchema.shape.type.safeParse(source.type)
  if (type.success) result.type = type.data
  if (typeof source.notes === 'string' && source.notes.length <= 2000)
    result.notes = source.notes
  return result
}

const columns = {
  parties: ['name', 'contact', 'email', 'address', 'notes'],
  cheques: [
    'party_id',
    'account_id',
    'cheque_number',
    'amount',
    'cheque_date',
    'deposit_date',
    'type',
    'notes',
  ],
}
export function importColumns(kind: ImportKind): string[] {
  return columns[kind]
}
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const phone = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function validateImport(
  kind: ImportKind,
  rows: ImportRow[],
  context: WorkspaceContext,
): PreviewRow[] {
  const partyNames = new Set(context.parties.map((p) => norm(p.name)))
  const contacts = new Set(context.parties.map((p) => phone(p.contact)))
  const emails = new Set(
    context.parties.map((p) => norm(p.email)).filter(Boolean),
  )
  const chequeKeys = new Set(
    context.cheques
      .filter((c) => !c.is_draft)
      .map((c) => `${c.account_id}:${c.cheque_number}`),
  )
  const parties = new Set(context.parties.map((p) => p.id))
  const accounts = new Set(context.accounts.map((a) => a.id))
  return rows.map((input, index) => {
    const data = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key.trim(),
        typeof value === 'string' ? value.trim() : value,
      ]),
    )
    const issues: PreviewRow['issues'] = []
    const add = (field: string, code: PreviewRow['issues'][number]['code']) =>
      issues.push({ field, code })
    if (rows.length > 500) add('rows', 'limit')
    for (const key of Object.keys(data))
      if (!columns[kind].includes(key)) add(key, 'unknownColumn')
    if (String(data.notes ?? '').length > 2000) add('notes', 'invalid')
    if (kind === 'parties') {
      const name = norm(String(data.name ?? ''))
      const contact = String(data.contact ?? '')
      const email = norm(String(data.email ?? ''))
      if (!importPartyValidators.name(name))
        add('name', name ? 'invalid' : 'required')
      if (!importPartyValidators.contact(contact)) add('contact', 'invalid')
      if (!importPartyValidators.email(email)) add('email', 'invalid')
      if (!importPartyValidators.address(String(data.address ?? '')))
        add('address', 'invalid')
      if (
        partyNames.has(name) ||
        contacts.has(phone(contact)) ||
        (email && emails.has(email))
      )
        add('name', 'duplicate')
      partyNames.add(name)
      contacts.add(phone(contact))
      if (email) emails.add(email)
    } else {
      if (!parties.has(String(data.party_id))) add('party_id', 'reference')
      if (!accounts.has(String(data.account_id))) add('account_id', 'reference')
      if (
        !importChequeValidators.cheque_number(String(data.cheque_number ?? ''))
      )
        add('cheque_number', 'invalid')
      if (!validAmount(data.amount)) add('amount', 'invalid')
      if (!validDate(String(data.cheque_date ?? '')))
        add('cheque_date', 'invalid')
      if (
        data.deposit_date &&
        (!validDate(String(data.deposit_date)) ||
          String(data.deposit_date) < String(data.cheque_date))
      )
        add('deposit_date', 'invalid')
      if (!importChequeValidators.type(String(data.type)))
        add('type', 'invalid')
      const key = `${data.account_id}:${data.cheque_number}`
      if (chequeKeys.has(key)) add('cheque_number', 'duplicate')
      chequeKeys.add(key)
    }
    return { row: index + 2, data, issues }
  })
}

type FilterableCheque = Partial<
  Pick<
    ChequeRow,
    | 'is_draft'
    | 'cheque_number'
    | 'notes'
    | 'status'
    | 'type'
    | 'party_id'
    | 'cheque_date'
  >
>

export function filterCheques<T extends FilterableCheque>(
  cheques: T[],
  filters: ChequeFilters,
): T[] {
  return cheques.filter(
    (c) =>
      !c.is_draft &&
      (!filters.search ||
        norm(`${c.cheque_number ?? ''} ${c.notes ?? ''}`).includes(
          norm(filters.search),
        )) &&
      (!filters.status || c.status === filters.status) &&
      (!filters.type || c.type === filters.type) &&
      (!filters.party_id || c.party_id === filters.party_id) &&
      (!filters.from || (c.cheque_date ?? '') >= filters.from) &&
      (!filters.to || (c.cheque_date ?? '') <= filters.to),
  )
}

export function canBulkTransition(
  cheque: ChequeRow,
  status: ChequeRow['status'],
): boolean {
  return (
    !cheque.is_draft &&
    !!cheque.status &&
    !!cheque.type &&
    !!status &&
    ChequeEntity.canTransitionFor(cheque.type, cheque.status, status)
  )
}

export function summarizeCheques(cheques: ChequeRow[]) {
  const result = {
    count: 0,
    inward: 0,
    outward: 0,
    pending: 0,
    cleared: 0,
    bounced: 0,
    netCleared: 0,
  }
  for (const cheque of cheques) {
    if (cheque.is_draft) continue
    const amount = Math.round((cheque.amount ?? 0) * 100)
    result.count++
    if (cheque.type === 'Inward') result.inward += amount
    else result.outward += amount
    if (cheque.status === 'Issued' || cheque.status === 'Received')
      result.pending += amount
    if (cheque.status === 'Bounced') result.bounced += amount
    if (cheque.status === 'Cleared') {
      result.cleared += amount
      result.netCleared += cheque.type === 'Inward' ? amount : -amount
    }
  }
  for (const key of [
    'inward',
    'outward',
    'pending',
    'cleared',
    'bounced',
    'netCleared',
  ] as const)
    result[key] /= 100
  return result
}
