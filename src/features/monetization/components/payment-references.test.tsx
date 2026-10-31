import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PaymentReferences } from './payment-references'
import type { Transaction } from '../repositories/monetization.repository'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const transaction: Transaction = {
  id: 'tx1',
  user_id: 'user',
  razorpay_order_id: 'order1',
  razorpay_payment_id: null,
  amount: 125,
  currency: 'INR',
  status: 'captured',
  type: 'lifetime',
  feature_id: 'lifetime_premium',
  created_at: '2026-10-31',
  updated_at: '2026-10-31',
}
it('copies payment references, displays missing IDs and surfaces clipboard failures for retry', async () => {
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('denied'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PaymentReferences transaction={transaction} />
    </NextIntlClientProvider>,
  )
  fireEvent.click(screen.getByText(messages.SharedUI.references))
  expect(
    screen.getByText(messages.Transactions.notAvailable),
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', {
      name: `${messages.SharedUI.copy} ${messages.SharedUI.transactionId}`,
    }),
  )
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.SharedUI.copied,
    ),
  )
  expect(writeText).toHaveBeenCalledWith('tx1')
  fireEvent.click(
    screen.getByRole('button', {
      name: `${messages.SharedUI.copy} ${messages.Transactions.orderId}`,
    }),
  )
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.SharedUI.copyFailed,
    ),
  )
  expect(writeText).toHaveBeenCalledWith('order1')
})
