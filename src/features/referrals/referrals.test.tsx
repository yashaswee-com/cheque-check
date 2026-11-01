import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import ReferralsPage from '@/app/(dashboard)/referrals/page'
import { ReferralCapture } from './components/referral-capture'
import { referralRepository } from './repositories/referral.repository'
import { referralSummarySchema } from '@/validators/referral'
const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  refetch: vi.fn(),
  rpc: vi.fn(),
  data: {
    eligible: false,
    code: null as string | null,
    applied_code: null as string | null,
    wallets: [] as { currency: string; balance: number; reserved: number }[],
    entries: [],
  },
  error: null as Error | null,
  isLoading: false,
}))
vi.mock('./hooks/use-referrals', () => ({ useReferrals: () => ({ ...mocks }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/login' }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  mocks.data = {
    eligible: false,
    code: null,
    applied_code: null,
    wallets: [],
    entries: [],
  }
  mocks.error = null
  mocks.isLoading = false
  mocks.apply.mockResolvedValue(undefined)
})
afterEach(cleanup)
function mount(capture = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {capture ? <ReferralCapture /> : <ReferralsPage />}
    </NextIntlClientProvider>,
  )
}
describe('referral link and wallet UI', () => {
  it('preserves valid links on login and restores for manual confirmation', () => {
    window.history.replaceState({}, '', '/login?ref=abcdef123456')
    mount(true)
    expect(localStorage.getItem('chequecheck-referral')).toBe('ABCDEF123456')
    cleanup()
    window.history.replaceState({}, '', '/referrals')
    mount()
    expect(screen.getByLabelText('Apply referral code')).toHaveValue(
      'ABCDEF123456',
    )
    expect(mocks.apply).not.toHaveBeenCalled()
  })
  it('never saves invalid referral URLs', () => {
    window.history.replaceState({}, '', '/login?ref=invalid')
    mount(true)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid')
    expect(localStorage.getItem('chequecheck-referral')).toBeNull()
  })
  it('applies only on explicit action and keeps immutable codes locked', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Apply referral code'), {
      target: { value: 'ABCDEF123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply referral code' }))
    await vi.waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith('ABCDEF123456'),
    )
    cleanup()
    mocks.data.applied_code = 'ABCDEF123456'
    mount()
    expect(screen.getByLabelText('Apply referral code')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Apply referral code' }),
    ).toBeDisabled()
  })
  it('shows signed wallet debt, reserved credit and current-owner sharing', () => {
    mocks.data.eligible = true
    mocks.data.code = 'ABCDEF123456'
    mocks.data.wallets = [{ currency: 'INR', balance: -5000, reserved: 1000 }]
    mount()
    expect(
      screen.getByText('INR -50.00 balance; INR 10.00 reserved'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Referral link')).toHaveValue(
      `${window.location.origin}/referrals?ref=ABCDEF123456`,
    )
  })
  it('reports application failure without pretending attribution succeeded', async () => {
    mocks.apply.mockRejectedValue(new Error('Code not eligible'))
    mount()
    fireEvent.change(screen.getByLabelText('Apply referral code'), {
      target: { value: 'ABCDEF123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply referral code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Code not eligible',
    )
    expect(
      screen.queryByText('Referral applied. It cannot be changed.'),
    ).not.toBeInTheDocument()
  })
  it('offers retry on query failure instead of an empty wallet', () => {
    mocks.error = new Error('offline')
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.queryByText('No credits yet.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })
})
describe('referral repository boundary', () => {
  it('validates and normalizes code before making a request', async () => {
    await expect(referralRepository.apply('bad')).rejects.toThrow(
      'Invalid referral code',
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await referralRepository.apply(' abcdef123456 ')
    expect(mocks.rpc).toHaveBeenCalledWith('apply_referral_code', {
      requested_code: 'ABCDEF123456',
    })
  })
  it('validates summaries and rejects success-shaped corrupt data', async () => {
    mocks.rpc.mockResolvedValue({ data: mocks.data, error: null })
    expect(await referralRepository.summary()).toEqual(mocks.data)
    mocks.rpc.mockResolvedValue({
      data: {
        ...mocks.data,
        wallets: [{ currency: 'INR', balance: 'oops', reserved: -1 }],
      },
      error: null,
    })
    await expect(referralRepository.summary()).rejects.toThrow()
    expect(
      referralSummarySchema.safeParse({
        ...mocks.data,
        entries: Array(51).fill({}),
      }).success,
    ).toBe(false)
  })
  it('surfaces database failures rather than reporting an empty wallet', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Offline', code: 'XX000' },
    })
    await expect(referralRepository.summary()).rejects.toThrow()
  })
})
