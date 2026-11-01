import { z } from 'zod'
export const freeUsageSchema = z.object({
  unlimited: z.boolean(),
  cheques_used: z.number().int().nonnegative(),
  cheques_limit: z.number().int().positive(),
  ai_scans_used: z.number().int().nonnegative(),
  ai_scans_limit: z.number().int().nonnegative(),
  voice_used: z.number().int().nonnegative(),
  voice_limit: z.number().int().nonnegative(),
})
