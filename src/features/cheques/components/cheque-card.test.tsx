import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import type { ChequeWithRelations } from '@/types'
import { ChequeCard } from './cheque-card'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      currency: '₹',
      date_format: 'dd/MM/yyyy',
      party_sms_enabled: false,
    },
  }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ requireAccess: vi.fn() }),
}))
afterEach(cleanup)

describe('shared cheque cards', () => {
  it('keeps detail navigation and status but exposes no delete trigger or dialog', () => {
    const cheque: ChequeWithRelations = {
      id: 'cheque',
      business_id: 'business',
      party_id: 'party',
      account_id: 'account',
      amount: 5000,
      cheque_number: '123456',
      cheque_date: '2099-01-01',
      status: 'Issued',
      type: 'Outward',
      deposit_date: null,
      remind_before_days: null,
      notes: null,
      image_url: null,
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
    }
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequeCard cheque={cheque} tags={[]} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/cheques/cheque')
    expect(screen.getByText('#123456')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
