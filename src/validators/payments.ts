import { z } from 'zod'
import { ProductIdSchema } from '@/features/monetization/constants'

export const PaymentProductIdSchema = ProductIdSchema

export type PaymentProductId = z.infer<typeof PaymentProductIdSchema>

export const CreatePaymentOrderSchema = z.object({
  productId: PaymentProductIdSchema,
  checkoutId: z.uuid().optional(),
})

export const PaymentOrderSchema = z
  .object({
    id: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: z.literal('INR'),
    productId: PaymentProductIdSchema,
    name: z.string().min(1),
    walletFunded: z.boolean().optional(),
    discount: z.number().int().nonnegative().optional(),
    walletAmount: z.number().int().nonnegative().optional(),
  })
  .refine(
    (order) => order.amount > 0 || order.walletFunded === true,
    'Zero-value order must be wallet funded',
  )

export type PaymentOrder = z.infer<typeof PaymentOrderSchema>
