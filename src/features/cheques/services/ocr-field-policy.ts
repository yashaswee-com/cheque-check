import type { ChequeFormValues } from '@/types'
import type { ScanCandidates, ScanJob } from '@/validators/cheque-scan'
import type { OcrField } from './ocr-contract'

export const ocrEditableFields = [
  'amount',
  'cheque_number',
  'cheque_date',
  'party_id',
  'account_id',
] as const

export type OcrEditableField = (typeof ocrEditableFields)[number]
export type OcrFieldSnapshot = Pick<ChequeFormValues, OcrEditableField>
export type OcrDirectField = Extract<
  OcrEditableField,
  'amount' | 'cheque_number' | 'cheque_date'
>
export type OcrDirectFieldValues = Pick<ChequeFormValues, OcrDirectField>

interface OcrResultContext {
  mounted: boolean
  businessId: string | undefined
  imageUrl: string | null | undefined
  mode: ChequeFormValues['type']
}

export function canApplyOcrResult(result: ScanJob, context: OcrResultContext) {
  return (
    context.mounted &&
    context.businessId === result.business_id &&
    context.imageUrl === result.image_url &&
    context.mode === result.mode
  )
}

export function getOcrFieldUpdates(
  result: ScanJob,
  fields: OcrField[],
  snapshot: OcrFieldSnapshot | null,
  current: OcrFieldSnapshot,
): Partial<OcrDirectFieldValues> {
  if (!result.details || !snapshot) return {}

  const updates: Partial<OcrDirectFieldValues> = {}
  if (
    fields.includes('amount') &&
    result.details.amount !== null &&
    current.amount === snapshot.amount
  )
    updates.amount = result.details.amount

  if (
    fields.includes('cheque_number') &&
    result.details.cheque_number !== null &&
    current.cheque_number === snapshot.cheque_number
  )
    updates.cheque_number = result.details.cheque_number

  if (
    fields.includes('cheque_date') &&
    result.details.cheque_date !== null &&
    current.cheque_date === snapshot.cheque_date
  )
    updates.cheque_date = result.details.cheque_date

  return updates
}

export function getUniqueExactAccountId(
  candidates: ScanCandidates,
  snapshot: OcrFieldSnapshot | null,
  currentAccountId: string,
) {
  const exact = candidates.accounts.filter((account) => account.exact)
  return snapshot?.account_id === currentAccountId && exact.length === 1
    ? exact[0].id
    : null
}
