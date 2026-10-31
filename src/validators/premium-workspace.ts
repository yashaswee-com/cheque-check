import { chequeSchema, partySchema } from './index'
import { z } from 'zod'
import { workspaceChequeRowSchema } from './persisted-cheque'

export const workspaceSnapshotSchema = z.object({
  businesses: z.array(z.object({ id: z.string(), name: z.string() })),
  cheques: z.array(workspaceChequeRowSchema),
})

export const printLayoutSchema = z.strictObject({
  payeeX: z.number().min(0).max(210),
  payeeY: z.number().min(0).max(297),
  amountX: z.number().min(0).max(210),
  amountY: z.number().min(0).max(297),
  dateX: z.number().min(0).max(210),
  dateY: z.number().min(0).max(297),
  chequeNumberX: z.number().min(0).max(210),
  chequeNumberY: z.number().min(0).max(297),
})

export function validDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '1900-01-01' ||
    value > '2200-12-31'
  )
    return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

export function validAmount(value: unknown): boolean {
  return (
    /^(?:\d+)(?:\.\d{1,2})?$/.test(String(value)) &&
    Number(value) > 0 &&
    Number(value) <= 999999999999.99
  )
}

export const importPartyValidators = {
  name: (value: string) =>
    partySchema.shape.name.safeParse(value).success && value.length <= 200,
  contact: (value: string) =>
    partySchema.shape.contact.safeParse(value).success,
  email: (value: string) =>
    !value || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254),
  address: (value: string) => value.length <= 1000,
}

export const importChequeValidators = {
  cheque_number: (value: string) =>
    chequeSchema.shape.cheque_number.safeParse(value).success,
  type: (value: unknown) => chequeSchema.shape.type.safeParse(value).success,
  amount: validAmount,
  cheque_date: validDate,
}
