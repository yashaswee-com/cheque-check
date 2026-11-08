// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { AdminClient } from '../lib/supabase'
import {
  listReservedPaymentCheckouts,
  releasePaymentCheckout,
} from '../domain/payments'

describe('payment checkout expiry helpers', () => {
  it('lists only reserved checkout metadata without returning customer contact data', async () => {
    const rows = [
      {
        id: 'checkout-id',
        user_id: 'user-id',
        product_id: 'lifetime_premium',
        provider_order: 'order-id',
        expires_at: '2026-11-08T10:00:00.000Z',
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const db = { from } as unknown as AdminClient

    await expect(listReservedPaymentCheckouts(db)).resolves.toEqual(rows)
    expect(from).toHaveBeenCalledWith('payment_checkouts')
    expect(select).toHaveBeenCalledWith(
      'id,user_id,product_id,provider_order,expires_at',
    )
    expect(eq).toHaveBeenCalledWith('status', 'reserved')
  })

  it('releases through the protected RPC and verifies the final state', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: 'expired' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const db = { from, rpc } as unknown as AdminClient

    await expect(releasePaymentCheckout(db, 'checkout-id')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('release_payment_checkout', {
      requested_id: 'checkout-id',
      requested_status: 'expired',
    })
    expect(eq).toHaveBeenCalledWith('id', 'checkout-id')
  })
})
