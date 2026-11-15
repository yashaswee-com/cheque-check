import { z } from 'zod'
import { PARTY_TYPES } from './index'
import { persistedChequeSchema, relatedChequeSchema } from './persisted-cheque'

const draftBase = z.object({
  id: z.string(),
  business_id: z.string(),
  is_draft: z.literal(true),
  created_at: z.string(),
  updated_at: z.string(),
})
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const chequeDraftSchema = draftBase.extend({
  party_id: z.string().nullable(),
  account_id: z.string().nullable(),
  cheque_number: z.string().nullable(),
  amount: z.number().finite().nullable(),
  cheque_date: z.string().nullable(),
  deposit_date: z.string().nullable(),
  type: persistedChequeSchema.shape.type.nullable(),
  notes: z.string().nullable(),
  image_url: z.string().nullable(),
  remind_before_days: z.number().nullable().optional(),
  party: relatedChequeSchema.shape.party,
  account: relatedChequeSchema.shape.account,
})

export const persistedPartySchema = z.looseObject({
  id: z.string(),
  business_id: z.string(),
  name: z.string(),
  contact: z.string(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  color: optionalText,
  icon: optionalText,
  avatar_url: z.string().nullable().optional(),
  party_type: z.enum(PARTY_TYPES).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  is_draft: z.literal(false).optional(),
})

export const partyDraftSchema = draftBase.extend({
  name: z.string().nullable(),
  contact: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  color: z.string().nullable(),
  avatar_url: z.string().nullable(),
  party_type: z.enum(PARTY_TYPES).nullable().optional(),
})

const bankSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  logo_url: z.string().nullable(),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
})

export const persistedAccountSchema = z.looseObject({
  id: z.string(),
  business_id: z.string(),
  bank_id: z.string().nullable(),
  account_name: z.string(),
  account_number: z.string(),
  ifsc_code: z.string().nullable(),
  opening_balance: z.number().finite(),
  is_default: z.boolean(),
  notes: z.string().nullable().optional(),
  color: optionalText,
  icon: optionalText,
  logo_url: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  bank: bankSchema.nullish().transform((value) => value ?? undefined),
  is_draft: z.literal(false).optional(),
})

export const accountDraftSchema = draftBase.extend({
  bank_id: z.string().nullable(),
  account_name: z.string().nullable(),
  account_number: z.string().nullable(),
  ifsc_code: z.string().nullable(),
  color: z.string().nullable(),
  notes: z.string().nullable(),
  opening_balance: z.number().finite().nullable(),
  is_default: z.boolean(),
  logo_url: z.string().nullable().optional(),
  bank: persistedAccountSchema.shape.bank,
})
