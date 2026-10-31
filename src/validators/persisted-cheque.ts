import { z } from 'zod'
import { DISTRIBUTION_STATUSES } from '@/features/cheques/lib/statistics'
import { chequeSchema } from './index'

const status = z.enum(DISTRIBUTION_STATUSES)
const type = chequeSchema.shape.type
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const persistedChequeSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  party_id: z.string(),
  account_id: z.string(),
  cheque_number: z.string(),
  amount: z.number().finite(),
  cheque_date: z.string(),
  deposit_date: z.string().nullable(),
  remind_before_days: z.number().nullable(),
  status,
  type,
  notes: z.string().nullable(),
  image_url: z.string().nullable(),
  is_draft: z.literal(false).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.null().optional(),
  deletion_batch_id: z.string().nullable().optional(),
})

export const relatedChequeSchema = persistedChequeSchema.extend({
  party: z
    .object({
      name: z.string(),
      contact: optionalText,
      color: optionalText,
      icon: optionalText,
      avatar_url: z.string().nullable().optional(),
    })
    .nullish()
    .transform((value) => value ?? undefined),
  account: z
    .object({
      account_name: z.string(),
      color: optionalText,
      icon: optionalText,
      bank: z
        .object({
          name: z.string(),
          logo_url: z.string().nullable().optional(),
        })
        .nullish()
        .transform((value) => value ?? undefined),
    })
    .nullish()
    .transform((value) => value ?? undefined),
})

export const relatedChequesSchema = z.array(relatedChequeSchema)

export const workspaceChequeRowSchema = persistedChequeSchema.extend({
  party_id: z.string().nullable(),
  account_id: z.string().nullable(),
  cheque_number: z.string().nullable(),
  amount: z.number().finite().nullable(),
  cheque_date: z.string().nullable(),
  status: status.nullable(),
  type: type.nullable(),
  is_draft: z.literal(false),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  deleted_at: z.null(),
  deletion_batch_id: z.string().nullable(),
})
