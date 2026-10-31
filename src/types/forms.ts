import type { z } from 'zod'
import type {
  accountSchema,
  businessSchema,
  chequeSchema,
  partySchema,
} from '@/validators'

export type AccountFormInput = z.input<typeof accountSchema>
export type AccountFormData = z.output<typeof accountSchema>
export type BusinessFormData = z.infer<typeof businessSchema>
export type ChequeFormValues = z.infer<typeof chequeSchema>
export type PartyFormData = z.infer<typeof partySchema>
