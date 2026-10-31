import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import type { ChequeWithRelations } from '@/types'
import { ChequeCard } from './cheque-card'
const state = vi.hoisted(() => ({
  smsEnabled: false,
  requireAccess: vi.fn(),
  prepareSms: vi.fn(),
}))

vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      currency: '₹',
      date_format: 'dd/MM/yyyy',
      party_sms_enabled: state.smsEnabled,
    },
  }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({
    requireAccess: state.requireAccess,
    accessRequiredMessage: 'Premium required',
  }),
}))
vi.mock('../lib/notify-party', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/notify-party')>()),
  preparePartySms: state.prepareSms,
}))
afterEach(cleanup)
beforeEach(() => {
  state.smsEnabled = false
  vi.clearAllMocks()
})
const baseCheque: ChequeWithRelations = {
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

describe('shared cheque cards', () => {
  it('requests premium authorization before notifying the cheque party', () => {
    state.smsEnabled = true
    const cheque: ChequeWithRelations = {
      ...baseCheque,
      id: 'notify',
      amount: 500,
      cheque_number: '123456',
      cheque_date: '2099-01-01',
      status: 'Issued',
      type: 'Outward',
      party: { name: 'Asha', contact: '+919876543210' },
    }
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequeCard cheque={cheque} />
      </NextIntlClientProvider>,
    )
    const notify = screen.getByRole('button', {
      name: messages.Cheques.notifyParty,
    })
    state.requireAccess.mockReturnValue(false)
    fireEvent.click(notify)
    expect(state.prepareSms).not.toHaveBeenCalled()
    state.requireAccess.mockReturnValue(true)
    fireEvent.click(notify)
    expect(state.requireAccess).toHaveBeenCalledWith('notify-party')
    expect(state.prepareSms).toHaveBeenCalledWith(
      messages.Cheques.notifyParty,
      '+919876543210',
      cheque,
      cheque.party,
      '₹',
      'Premium required',
    )
  })
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

  it('previews both swipe actions and updates status only above the swipe threshold', () => {
    const update = vi.fn()
    const cheque: ChequeWithRelations = {
      ...baseCheque,
      id: 'swipe',
      amount: 500,
      cheque_number: '654321',
      cheque_date: '2099-01-01',
      status: 'Issued',
      type: 'Outward',
    }
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequeCard cheque={cheque} onStatusUpdate={update} />
      </NextIntlClientProvider>,
    )
    const card = screen.getByTestId('cheque-card-swipe')
    const swipe = (x: number) => {
      fireEvent.mouseDown(card, { clientX: 300, clientY: 100, buttons: 1 })
      fireEvent.mouseMove(document, {
        clientX: 300 + x,
        clientY: 100,
        buttons: 1,
      })
      fireEvent.mouseUp(document, { clientX: 300 + x, clientY: 100 })
    }
    swipe(30)
    expect(update).not.toHaveBeenCalled()
    swipe(100)
    expect(update).not.toHaveBeenCalled()
    swipe(200)
    expect(update).toHaveBeenLastCalledWith('swipe', 'Cleared')
    swipe(-200)
    expect(update).toHaveBeenLastCalledWith('swipe', 'Bounced')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequeCard
          cheque={{ ...cheque, status: 'Cleared' }}
          onStatusUpdate={update}
        />
      </NextIntlClientProvider>,
    )
    update.mockClear()
    swipe(200)
    swipe(-200)
    expect(update).not.toHaveBeenCalled()
  })
})
