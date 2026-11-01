import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { LoginPhoneSection } from './login-phone-section'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  error: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('../services/auth.service', () => ({ authService: mocks }))
vi.mock('@/lib/logger', () => ({ logger: mocks }))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('./phone-auth-form', () => ({
  PhoneAuthForm: ({
    purpose,
    onCancel,
    onVerified,
  }: {
    purpose: string
    onCancel: () => void
    onVerified: () => void
  }) => (
    <div>
      <p>Form {purpose}</p>
      <button onClick={onCancel}>Cancel linking</button>
      <button onClick={onVerified}>Verified</button>
    </div>
  ),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue(null)
})
afterEach(cleanup)
function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPhoneSection enabled />
    </NextIntlClientProvider>,
  )
}

describe('LoginPhoneSection', () => {
  it('keeps an unlinked phone field visible when OTP linking is disabled', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LoginPhoneSection enabled={false} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('login-phone-link-button')).toBeDisabled()
    expect(screen.getByLabelText(messages.PhoneAuth.linkTitle)).toHaveValue('')
    expect(
      screen.getByText(messages.PhoneAuth.linkDisabled),
    ).toBeInTheDocument()
  })
  it('does not display an unconfirmed login phone as linked', async () => {
    mocks.getUser.mockResolvedValue({
      phone: '919876543210',
      phone_confirmed_at: null,
    })
    mount()
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce())
    expect(screen.getByLabelText(messages.PhoneAuth.linkTitle)).toHaveValue('')
  })
  it('offers linking for an unlinked user and permits canceling', async () => {
    mount()
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce())
    expect(screen.getByText(messages.PhoneAuth.notLinked)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('login-phone-link-button'))
    expect(screen.getByText('Form link')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel linking' }))
    expect(screen.queryByText('Form link')).not.toBeInTheDocument()
  })

  it('masks an existing linked phone and offers changing it', async () => {
    mocks.getUser.mockResolvedValue({
      phone: '919876543210',
      phone_confirmed_at: '2026-11-02T00:00:00Z',
    })
    mount()
    await waitFor(() =>
      expect(screen.getByTestId('login-phone-link-button')).toHaveTextContent(
        messages.PhoneAuth.changeAction,
      ),
    )
    expect(screen.queryByText(/919876543210/)).not.toBeInTheDocument()
  })

  it('refreshes the identity and reports a successful link after verification', async () => {
    mocks.getUser
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        phone: '+919876543210',
        phone_confirmed_at: '2026-11-02T00:00:00Z',
      })
    mount()
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('login-phone-link-button'))
    fireEvent.click(screen.getByRole('button', { name: 'Verified' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.PhoneAuth.linkSuccess,
    )
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByTestId('login-phone-link-button'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('logs identity-load errors and notifies the user', async () => {
    const failure = new Error('offline')
    mocks.getUser.mockRejectedValue(failure)
    mount()
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'Failed to load linked login phone',
        failure,
      ),
    )
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.PhoneAuth.errors.unknown,
      type: 'error',
    })
  })
})
