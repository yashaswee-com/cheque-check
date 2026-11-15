import type { Cheque, ChequeFormValues } from '@/types'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'

export type ChequePublicationOutcome = {
  cheque: ChequeEntity
  source: 'direct' | 'draft'
}

export function buildChequePublication(
  values: ChequeFormValues,
  remindBeforeDays: number | null,
): Omit<Cheque, 'id' | 'business_id' | 'created_at' | 'updated_at'> {
  return {
    ...values,
    image_url: values.image_url ?? null,
    notes: values.notes || null,
    remind_before_days: remindBeforeDays,
    status: ChequeEntity.initialStatusFor(values.type),
  }
}
