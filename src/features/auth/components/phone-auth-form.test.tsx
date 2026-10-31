import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PhoneAuthForm } from './phone-auth-form'

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined as string | undefined },
}))

vi.mock('@/features/auth/services/auth.service', () => ({
  authService: mocks,
}))

vi.mock('@/lib/env/client', () => ({
  publicEnv: mocks.env,
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'turnstile')
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = undefined
})

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneAuthForm purpose="signup" onVerified={vi.fn()} />
    </NextIntlClientProvider>,
  )
}

describe('PhoneAuthForm signup name', () => {
  it('validates numbers, supports cancellation and displays a rate-limit error', async () => {
    const cancel = vi.fn()
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 600,
    })
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhoneAuthForm
          purpose="login"
          onVerified={vi.fn()}
          onCancel={cancel}
          showSignupHint
        />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.invalid_phone,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '+14155552671' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.unsupported_country,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543210' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PhoneAuth.errors.rate_limited,
      ),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PhoneAuth.cancel }),
    )
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('verifies normalized codes, clears rejected codes, resends and edits the number', async () => {
    const verified = vi.fn()
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 0,
    })
    mocks.verifyPhoneOtp
      .mockResolvedValueOnce({ ok: false, code: 'invalid_or_expired_code' })
      .mockResolvedValueOnce({ ok: true, phone: '+919876543210' })
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhoneAuthForm purpose="link" onVerified={verified} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543210' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    const input = await screen.findByTestId('phone-auth-code-input')
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.invalid_or_expired_code,
    )
    fireEvent.change(input, { target: { value: '12ab34' } })
    expect(input).toHaveValue('1234')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('phone-auth-verify-button'))
    await waitFor(() => expect(input).toHaveValue(''))
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      purpose: 'link',
    })
    fireEvent.click(screen.getByTestId('phone-auth-resend-button'))
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledTimes(2))
    fireEvent.change(input, { target: { value: '654321' } })
    fireEvent.click(screen.getByTestId('phone-auth-verify-button'))
    await waitFor(() => expect(verified).toHaveBeenCalledWith('+919876543210'))
    fireEvent.click(
      screen.getByRole('button', { name: messages.PhoneAuth.editNumber }),
    )
    expect(screen.getByTestId('phone-auth-number-input')).toHaveValue(
      '9876543210',
    )
  })

  it('counts down before allowing resend and stops its interval at expiry', async () => {
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 2,
    })
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhoneAuthForm purpose="login" onVerified={vi.fn()} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543210' },
    })
    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    })
    expect(screen.getByTestId('phone-auth-resend-button')).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByTestId('phone-auth-resend-button')).toBeEnabled()
  })

  it('requires a fresh captcha token and forwards it to the OTP service', async () => {
    mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site'
    const widget = vi.fn(
      (_node: HTMLElement, _options: { callback: (token: string) => void }) =>
        'widget',
    )
    Object.defineProperty(window, 'turnstile', {
      configurable: true,
      value: { render: widget, remove: vi.fn() },
    })
    mocks.sendPhoneOtp.mockResolvedValue({
      ok: true,
      phone: '+919876543210',
      resendAfterSeconds: 0,
    })
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhoneAuthForm purpose="login" onVerified={vi.fn()} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543210' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.captcha_required,
    )
    await waitFor(() => expect(widget).toHaveBeenCalled())
    act(() => widget.mock.calls[0][1].callback('captcha'))
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    await screen.findByTestId('phone-auth-code-input')
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      purpose: 'login',
      captchaToken: 'captcha',
    })
    fireEvent.click(screen.getByTestId('phone-auth-resend-button'))
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.captcha_required,
    )
  })

  it('preserves non-rate-limit send and verification failures for correction', async () => {
    mocks.sendPhoneOtp
      .mockResolvedValueOnce({
        ok: false,
        code: 'provider_unavailable',
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        phone: '+919876543210',
        resendAfterSeconds: 0,
      })
    mocks.verifyPhoneOtp.mockResolvedValue({
      ok: false,
      code: 'phone_in_use',
      status: 409,
    })
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhoneAuthForm purpose="login" onVerified={vi.fn()} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543210' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PhoneAuth.errors.provider_unavailable,
      ),
    )
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    const code = await screen.findByTestId('phone-auth-code-input')
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('phone-auth-verify-button'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PhoneAuth.errors.phone_in_use,
      ),
    )
    expect(code).toHaveValue('123456')
  })

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
