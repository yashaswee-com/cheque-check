import { z } from 'zod'

const metric = z.object({
  status: z.enum(['Issued', 'Received', 'Cleared', 'Bounced']),
  type: z.enum(['Outward', 'Inward']),
  cheque_count: z.number().int().nonnegative(),
  total_amount: z.number().finite().nonnegative(),
  today_count: z.number().int().nonnegative(),
  today_amount: z.number().finite().nonnegative(),
  overdue_count: z.number().int().nonnegative(),
  overdue_amount: z.number().finite().nonnegative(),
})
export const chequeAnalyticsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.enum(['day', 'week', 'month']),
  series: z
    .array(
      z.object({
        day: z.iso.date(),
        outward_count: z.number().int().nonnegative(),
        inward_count: z.number().int().nonnegative(),
        outward_amount: z.number().finite().nonnegative(),
        inward_amount: z.number().finite().nonnegative(),
      }),
    )
    .max(121),
  summary: z.array(metric).max(8),
  banks: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        name: z.string(),
        metrics: z.array(metric).max(8),
      }),
    )
    .max(100),
  matching_banks: z.number().int().nonnegative(),
})
export type ChequeAnalytics = z.infer<typeof chequeAnalyticsSchema>
export type AnalyticsMetric = ChequeAnalytics['summary'][number]
