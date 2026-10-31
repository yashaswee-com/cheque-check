import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../../messages/en.json'
import hindi from '../../../../../messages/hi.json'
import hinglish from '../../../../../messages/hi-en.json'
import type { Transaction } from '@/features/monetization/repositories/monetization.repository'
import TransactionsPage from './page'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), copy: vi.fn() }))
let transactions: Transaction[] = []
let error: Error | null = null
vi.mock('@/features/monetization/hooks/use-transactions', () => ({
  useTransactions: () => ({
    transactions,
    isLoading: false,
    isRefreshing: false,
    error,
    refresh: mocks.refresh,
  }),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  error = null
  mocks.copy.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.copy },
  })
  transactions = (
    ['created', 'authorized', 'captured', 'failed', 'refunded'] as const
  ).map((status, index) => ({
    id: `transaction-${index}`,
    product_id: 'ai_scan_250',
    user_id: 'user',
    razorpay_order_id: `order-${index}`,
    razorpay_payment_id: index === 0 ? null : `payment-${index}`,
    status,
    type: 'top_up',
    feature_id: 'ai_scan',
    amount: 5000,
    currency: 'INR',
    created_at: `2026-10-${10 + index}T00:00:00Z`,
    updated_at: '',
  }))
})

function page(locale = 'en', translations: AbstractIntlMessages = messages) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={translations}
      timeZone="UTC"
    >
      <TransactionsPage />
    </NextIntlClientProvider>,
  )
}

describe('payment history cards', () => {
  it.each([
    ['en', messages],
    ['hi', hindi],
    ['hi-en', hinglish],
  ] as const)(
    'names the exact product and keeps all payment states distinct in %s',
    (locale, translations) => {
      page(locale, translations)
      expect(
        screen.getAllByRole('heading', {
          name: translations.ProductNames.ai_scan_250,
        }),
      ).toHaveLength(5)
      for (const status of [
        'created',
        'authorized',
        'captured',
        'failed',
        'refunded',
      ] as const) {
        expect(
          screen.getByText(translations.Transactions[status]),
        ).toBeInTheDocument()
      }
      expect(screen.getAllByText(/INR/)).toHaveLength(5)
    },
  )

  it('keeps references collapsed until expanded and provides copy feedback', async () => {
    page()
    const summary = screen.getAllByText(messages.SharedUI.references)[0]
    const details = summary.closest('details')!
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(details).toHaveAttribute('open')
    fireEvent.click(
      within(details).getByRole('button', {
        name: `${messages.SharedUI.copy} ${messages.Transactions.orderId}`,
      }),
    )
    expect(mocks.copy).toHaveBeenCalledWith('order-4')
    expect(await within(details).findByRole('status')).toHaveTextContent(
      messages.SharedUI.copied,
    )
  })

  it('allows searching product names as well as references', () => {
    page()
    const input = screen.getByPlaceholderText(
      messages.Transactions.searchPlaceholder,
    )
    fireEvent.change(input, { target: { value: 'order-2' } })
    expect(
      screen.getAllByRole('heading', {
        name: messages.ProductNames.ai_scan_250,
      }),
    ).toHaveLength(1)
    fireEvent.change(input, { target: { value: 'scanner' } })
    expect(
      screen.getAllByRole('heading', {
        name: messages.ProductNames.ai_scan_250,
      }),
    ).toHaveLength(5)
  })

  it('shows copy failure without hiding the selectable reference', async () => {
    mocks.copy.mockRejectedValue(new Error('Clipboard denied'))
    page()
    const details = screen
      .getAllByText(messages.SharedUI.references)[0]
      .closest('details')!
    fireEvent.click(within(details).getByText(messages.SharedUI.references))
    fireEvent.click(
      within(details).getByRole('button', {
        name: `${messages.SharedUI.copy} ${messages.Transactions.orderId}`,
      }),
    )
    expect(await within(details).findByRole('status')).toHaveTextContent(
      messages.SharedUI.copyFailed,
    )
    expect(within(details).getByText('order-4')).toBeInTheDocument()
  })

  it('retains retry when payment history fails', () => {
    error = new Error('Unavailable')
    page()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Premium.retry }),
    )
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})
