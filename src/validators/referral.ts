import { z } from 'zod'
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-F0-9]{12}$/)
export const referralSummarySchema = z.object({
  eligible: z.boolean(),
  code: referralCodeSchema.nullable(),
  applied_code: referralCodeSchema.nullable(),
  wallets: z.array(
    z.object({
      currency: z.literal('INR'),
      balance: z.number().int(),
      reserved: z.number().int().nonnegative(),
    }),
  ),
  entries: z
    .array(
      z.object({
        id: z.string(),
        currency: z.literal('INR'),
        kind: z.enum(['reward', 'spend', 'reward_reversal', 'spend_refund']),
        amount: z.number().int(),
        created_at: z.string(),
      }),
    )
    .max(50),
})
