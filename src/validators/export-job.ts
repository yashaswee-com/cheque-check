import { z } from 'zod'

export const EXPORT_JOB_STATUSES = [
  'queued',
  'processing',
  'ready',
  'failed',
  'expired',
] as const
export const exportJobPageRequestSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  status: z.enum(EXPORT_JOB_STATUSES).optional(),
  format: z.enum(['csv', 'json']).optional(),
})
export type ExportJobPageRequest = z.infer<typeof exportJobPageRequestSchema>

const base = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  format: z.enum(['csv', 'json']),
  status: z.enum(['queued', 'processing', 'ready', 'failed', 'expired']),
  row_count: z.number().int().min(1).max(50000),
  next_part: z.number().int().min(0).max(100),
  part_count: z.number().int().min(1).max(100),
  created_at: z.string(),
  expires_at: z.string(),
  error_code: z.string().nullable(),
})
const validProgress = (job: {
  part_count: number
  row_count: number
  next_part: number
}) =>
  job.part_count === Math.ceil(job.row_count / 500) &&
  job.next_part <= job.part_count
export const exportJobSchema = base.refine(validProgress, {
  message: 'Invalid export progress',
})
export const exportJobListSchema = z.array(
  base
    .omit({ user_id: true })
    .refine(validProgress, { message: 'Invalid export progress' }),
)
