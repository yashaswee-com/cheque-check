import { z } from 'zod'
export const paymentCheckoutSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  product_id: z.string(),
  currency: z.literal('INR'),
  provider_amount: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  wallet_amount: z.number().int().nonnegative(),
  provider_order: z.string().nullable(),
  status: z.enum(['reserved', 'paid', 'expired', 'failed', 'refunded']),
})
