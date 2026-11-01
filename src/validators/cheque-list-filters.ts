import { z } from 'zod'
import { parseCalendarDate } from '@/lib/preference-format'

const day = z
  .string()
  .refine((value) => parseCalendarDate(value, 'yyyy-MM-dd') === value)
const amount = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .transform(Number)
  .pipe(z.number().finite().nonnegative())
export const chequeListFiltersSchema = z
  .object({
    type: z.enum(['Outward', 'Inward']).optional(),
    from: day.optional(),
    to: day.optional(),
    due_from: day.optional(),
    due_to: day.optional(),
    statuses: z
      .array(z.enum(['Issued', 'Received', 'Cleared', 'Bounced']))
      .max(4)
      .optional(),
    party_type: z
      .enum(['customer', 'supplier', 'vendor', 'unclassified'])
      .optional(),
    min_amount: z.number().finite().nonnegative().optional(),
    max_amount: z.number().finite().nonnegative().optional(),
    bank_ids: z
      .array(z.union([z.uuid(), z.literal('unknown')]))
      .max(100)
      .optional(),
  })
  .superRefine((value, context) => {
    for (const [from, to] of [
      [value.from, value.to],
      [value.due_from, value.due_to],
    ]) {
      if (from && to && from > to)
        context.addIssue({ code: 'custom', message: 'Date range is reversed' })
    }
    if (
      value.min_amount !== undefined &&
      value.max_amount !== undefined &&
      value.min_amount > value.max_amount
    )
      context.addIssue({ code: 'custom', message: 'Amount range is reversed' })
  })

export const CHEQUE_FILTER_PARAMS = [
  'date',
  'from',
  'to',
  'due_from',
  'due_to',
  'statuses',
  'party_type',
  'min_amount',
  'max_amount',
  'bank_ids',
  'q',
  'type',
] as const

export function parseChequeListUrl(params: URLSearchParams) {
  const optional = (key: string) =>
    params.has(key) ? params.get(key)! : undefined
  const rawMin = optional('min_amount')
  const rawMax = optional('max_amount')
  const min = rawMin === undefined ? undefined : amount.safeParse(rawMin)
  const max = rawMax === undefined ? undefined : amount.safeParse(rawMax)
  if ((min && !min.success) || (max && !max.success))
    return { success: false as const }
  const raw = {
    type: optional('type'),
    from: optional('date') ?? optional('from'),
    to: optional('date') ?? optional('to'),
    due_from: optional('due_from'),
    due_to: optional('due_to'),
    statuses: optional('statuses')?.split(','),
    party_type: optional('party_type'),
    min_amount: min?.success ? min.data : undefined,
    max_amount: max?.success ? max.data : undefined,
    bank_ids: optional('bank_ids')?.split(','),
  }
  const result = chequeListFiltersSchema.safeParse(
    Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined),
    ),
  )
  const sort = z
    .enum(['date', 'amount'])
    .safeParse(params.get('sort') ?? 'date')
  const order = z.enum(['asc', 'desc']).safeParse(params.get('order') ?? 'desc')
  const search = z
    .string()
    .max(200)
    .safeParse(params.get('q') ?? '')
  if (!result.success || !sort.success || !order.success || !search.success)
    return { success: false as const }
  return {
    success: true as const,
    filters: result.data,
    sort: sort.data,
    order: order.data,
    search: search.data,
  }
}
