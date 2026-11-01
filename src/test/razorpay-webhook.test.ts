// @vitest-environment node
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRazorpayWebhook } from '../../supabase/functions/razorpay-webhook/handler'
const secret = 'ephemeral-test-webhook-key'
const rpc = vi.fn()
function request(body: unknown, valid = true) {
  const text = JSON.stringify(body)
  return new Request('https://local.test/webhook', {
    method: 'POST',
    body: text,
    headers: {
      'x-razorpay-signature': valid
        ? createHmac('sha256', secret).update(text).digest('hex')
        : 'a'.repeat(64),
    },
  })
}
const paid = {
  event: 'order.paid',
  payload: {
    order: {
      entity: {
        id: 'order',
        amount: 24000,
        currency: 'INR',
        notes: { user_id: 'user', product_id: 'lifetime_premium' },
      },
    },
    payment: {
      entity: {
        id: 'payment',
        order_id: 'order',
        amount: 24000,
        currency: 'INR',
        status: 'captured',
      },
    },
  },
}
const refund = {
  event: 'refund.processed',
  payload: {
    refund: {
      entity: {
        id: 'refund',
        payment_id: 'payment',
        amount: 24000,
        currency: 'INR',
        status: 'processed',
      },
    },
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
})
describe('signed payment and refund webhook', () => {
  it.each([paid, refund])(
    'verifies raw HMAC before any fulfillment',
    async (body) => {
      expect(
        (await handleRazorpayWebhook(request(body, false), secret, rpc)).status,
      ).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    },
  )
  it('accepts discounted captured payment without using full catalog price', async () => {
    expect(
      (await handleRazorpayWebhook(request(paid), secret, rpc)).status,
    ).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'fulfill_payment_order',
      expect.objectContaining({
        paid_amount: 24000,
        razorpay_payment: 'payment',
      }),
    )
  })
  it('delegates processed refunds to atomic full-refund validation', async () => {
    expect(
      (await handleRazorpayWebhook(request(refund), secret, rpc)).status,
    ).toBe(200)
    expect(rpc).toHaveBeenCalledWith('refund_payment_checkout', {
      requested_payment: 'payment',
      requested_amount: 24000,
      requested_currency: 'INR',
    })
  })
  it('returns explicit operator failure for partial refund rejection', async () => {
    rpc.mockResolvedValue({
      error: {
        code: '22023',
        message: 'Partial refund requires operator handling',
      },
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      (await handleRazorpayWebhook(request(refund), secret, rpc)).status,
    ).toBe(422)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
  it.each(['refund.created', 'payment.dispute.created'])(
    'requires explicit operator handling for %s',
    async (event) => {
      expect(
        (await handleRazorpayWebhook(request({ event }), secret, rpc)).status,
      ).toBe(422)
      expect(rpc).not.toHaveBeenCalled()
    },
  )
  it('rejects mismatched payment, malformed refund and missing configuration', async () => {
    expect(
      (
        await handleRazorpayWebhook(
          request({
            ...paid,
            payload: {
              ...paid.payload,
              payment: {
                entity: { ...paid.payload.payment.entity, amount: 1 },
              },
            },
          }),
          secret,
          rpc,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await handleRazorpayWebhook(
          request({ event: 'refund.processed' }),
          secret,
          rpc,
        )
      ).status,
    ).toBe(400)
    expect(
      (await handleRazorpayWebhook(request(refund), undefined, rpc)).status,
    ).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })
})
