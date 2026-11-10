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
  toast: vi.fn(),
  env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined as string | undefined },
}))

vi.mock('@/features/auth/services/auth.service', () => ({
  authService: mocks,
}))

vi.mock('@/lib/env/client', () => ({
  publicEnv: mocks.env,
}))

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toast },
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'turnstile')
  Reflect.deleteProperty(document, 'elementFromPoint')
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = undefined
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => null),
  })
})

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneAuthForm purpose="signup" onVerified={vi.fn()} />
    </NextIntlClientProvider>,
  )
}

describe('PhoneAuthForm signup name', () => {
  it.each(['login', 'signup', 'link'] as const)(
    'uses the India-locked shared input for %s and accepts formatted pasted numbers',
    async (purpose) => {
      mocks.sendPhoneOtp.mockResolvedValue({
        ok: true,
        phone: '+919876543210',
        resendAfterSeconds: 60,
      })
      const user = userEvent.setup()
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <PhoneAuthForm purpose={purpose} onVerified={vi.fn()} />
        </NextIntlClientProvider>,
      )
      if (purpose === 'signup') {
        await user.type(
          screen.getByTestId('phone-auth-name-input'),
          'Test User',
        )
      }
      const country = screen.getByRole('button', {
        name: messages.Common.selectCountry,
      })
      expect(country).toBeDisabled()
      expect(country).toHaveTextContent('+91')
      await user.click(screen.getByLabelText(messages.PhoneAuth.phoneLabel))
      await user.paste('+91 98765 43210')
      await user.click(screen.getByTestId('phone-auth-send-button'))
      await screen.findByTestId('phone-auth-code-input')
      expect(mocks.sendPhoneOtp).toHaveBeenCalledOnce()
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+919876543210', purpose }),
      )
    },
  )

  it.each([
    'invalid_request',
    'invalid_phone',
    'unsupported_country',
    'invalid_or_expired_code',
    'rate_limited',
    'captcha_failed',
    'phone_in_use',
    'already_linked',
    'account_not_found',
    'unauthorized',
    'account_deactivated',
    'provider_unavailable',
    'unknown',
  ] as const)(
    'shows a descriptive toast and inline error for %s',
    async (code) => {
      mocks.sendPhoneOtp.mockResolvedValue({ ok: false, code })
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
        expect(mocks.toast).toHaveBeenCalledWith({
          title: messages.PhoneAuth.errorTitle,
          description: messages.PhoneAuth.errors[code],
          type: 'error',
        }),
      )
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PhoneAuth.errors[code],
      )
      expect(screen.getByTestId('phone-auth-send-button')).toBeEnabled()
    },
  )

  it('keeps an unregistered number on the phone step and allows another login attempt', async () => {
    mocks.sendPhoneOtp
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        code: 'account_not_found',
      })
      .mockResolvedValueOnce({
        ok: true,
        phone: '+919876543211',
        resendAfterSeconds: 60,
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
        messages.PhoneAuth.errors.account_not_found,
      ),
    )
    expect(
      screen.queryByTestId('phone-auth-code-input'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('phone-auth-resend-button'),
    ).not.toBeInTheDocument()
    expect(mocks.verifyPhoneOtp).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '9876543211' },
    })
    fireEvent.click(screen.getByTestId('phone-auth-send-button'))
    expect(
      await screen.findByTestId('phone-auth-code-input'),
    ).toBeInTheDocument()
    expect(mocks.sendPhoneOtp).toHaveBeenLastCalledWith({
      phone: '+919876543211',
      purpose: 'login',
      captchaToken: undefined,
    })
  })

  it('surfaces unexpected request failures and allows retry', async () => {
    mocks.sendPhoneOtp.mockRejectedValue(new Error('network failed'))
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
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.PhoneAuth.errorTitle,
        description: messages.PhoneAuth.errors.unknown,
        type: 'error',
      }),
    )
    expect(screen.getByTestId('phone-auth-send-button')).toBeEnabled()
  })

  it('supports formatted paste and keyboard editing across six digit slots', async () => {
    const user = userEvent.setup()
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
    await user.type(screen.getByTestId('phone-auth-number-input'), '9876543210')
    await user.click(screen.getByTestId('phone-auth-send-button'))
    const input = await screen.findByTestId('phone-auth-code-input')
    await user.click(input)
    await user.paste('123 45')
    expect(input).toHaveValue('12345')
    expect(screen.getByTestId('phone-auth-code-slots')).toHaveTextContent(
      '12345',
    )
    expect(screen.getByTestId('phone-auth-verify-button')).toBeDisabled()
    await user.keyboard('{End}{Backspace}')
    expect(input).toHaveValue('1234')
    expect(screen.getByTestId('phone-auth-verify-button')).toBeDisabled()
    await user.keyboard('9')
    expect(input).toHaveValue('12349')
  })

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
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('phone-auth-number-input'), {
      target: { value: '' },
    })
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
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(
      screen
        .getByTestId('phone-auth-code-slots')
        .querySelectorAll('[data-slot="otp-slot"]'),
    ).toHaveLength(6)
    expect(
      screen
        .getByRole('button', { name: messages.PhoneAuth.editNumber })
        .querySelector('svg'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('phone-auth-resend-button').querySelector('svg'),
    ).toBeInTheDocument()
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.PhoneAuth.errors.invalid_or_expired_code,
    )
    fireEvent.change(input, { target: { value: '12ab34' } })
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '1234' } })
    expect(input).toHaveValue('1234')
    expect(screen.getByTestId('phone-auth-verify-button')).toBeDisabled()
    fireEvent.change(input, { target: { value: '123456' } })
    expect(screen.getByTestId('phone-auth-code-slots')).toHaveTextContent(
      '123456',
    )
    await waitFor(() => expect(input).toHaveValue(''))
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenLastCalledWith({
      title: messages.PhoneAuth.errorTitle,
      description: messages.PhoneAuth.errors.invalid_or_expired_code,
      type: 'error',
    })
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      purpose: 'link',
    })
    fireEvent.click(screen.getByTestId('phone-auth-resend-button'))
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledTimes(2))
    fireEvent.change(input, { target: { value: '654321' } })
    await waitFor(() => expect(verified).toHaveBeenCalledWith('+919876543210'))
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledTimes(2)
    fireEvent.click(
      screen.getByRole('button', { name: messages.PhoneAuth.editNumber }),
    )
    expect(screen.getByTestId('phone-auth-number-input')).toHaveValue(
      '+91 98765 43210',
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
      (
        _node: HTMLElement,
        _options: { action?: string; callback: (token: string) => void },
      ) => 'widget',
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
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.PhoneAuth.errorTitle,
      description: messages.PhoneAuth.errors.captcha_required,
      type: 'error',
    })
    await waitFor(() => expect(widget).toHaveBeenCalled())
    expect(widget.mock.calls[0][1].action).toBe('phone_login')
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
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PhoneAuth.errors.phone_in_use,
      ),
    )
    expect(code).toHaveValue('123456')
    fireEvent.click(screen.getByTestId('phone-auth-verify-button'))
    await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledTimes(2))
  })

  it('requires a name before requesting a signup code', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('phone-auth-number-input'), '9876543210')
    await user.click(screen.getByTestId('phone-auth-send-button'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter your name to create an account.',
    )
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.PhoneAuth.errorTitle,
      description: messages.PhoneAuth.errors.name_required,
      type: 'error',
    })
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
