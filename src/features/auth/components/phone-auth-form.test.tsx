import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PhoneAuthForm } from './phone-auth-form'

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
}))

vi.mock('@/features/auth/services/auth.service', () => ({
  authService: mocks,
}))

vi.mock('@/lib/env/client', () => ({
  publicEnv: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined },
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneAuthForm purpose="signup" onVerified={vi.fn()} />
    </NextIntlClientProvider>,
  )
}

describe('PhoneAuthForm signup name', () => {
  it('requires a name before requesting a signup code', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('phone-auth-number-input'), '9876543210')
    await user.click(screen.getByTestId('phone-auth-send-button'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter your name to create an account.',
    )
    await waitFor(() =>
      expect(screen.getByTestId('phone-auth-name-input')).toHaveFocus(),
    )
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled()
  })

  it('sends the trimmed name with the verified phone signup request', async () => {
    const user = userEvent.setup()
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 60,
    })
    renderForm()

    await user.type(screen.getByTestId('phone-auth-name-input'), '  Asha Rao  ')
    await user.type(screen.getByTestId('phone-auth-number-input'), '9876543210')
    await user.click(screen.getByTestId('phone-auth-send-button'))

    await waitFor(() =>
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith({
        phone: '+919876543210',
        purpose: 'signup',
        captchaToken: undefined,
        name: 'Asha Rao',
      }),
    )
    expect(screen.getByTestId('phone-auth-code-input')).toBeInTheDocument()
  })
})
