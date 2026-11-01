import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'

export type PublicProduct = {
  id: string
  name: string
  amount: number
  currency: string
  transaction_type: 'lifetime' | 'subscription' | 'top_up'
}

export class PublicPricingRepository {
  constructor(
    private readonly client: ReturnType<
      typeof createAdminClient
    > = createAdminClient(),
  ) {}

  async listProducts(): Promise<PublicProduct[]> {
    const { data, error } = await this.client
      .from(TABLES.PAYMENT_PRODUCTS)
      .select(
        'id, name, amount, currency, transaction_type, required_entitlement_id',
      )
      .eq('active', true)
      .order('amount', { ascending: true })
      .order('id', { ascending: true })

    if (error) throw error

    return (data ?? [])
      .filter((product) => product.required_entitlement_id === null)
      .map(({ id, name, amount, currency, transaction_type }) => ({
        id,
        name,
        amount,
        currency,
        transaction_type,
      }))
  }
}
