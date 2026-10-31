import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import LoginPage from './login/page'
import SignupPage from './signup/page'
import ForgotPasswordPage from './forgot-password/page'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  oauth: vi.fn(),
  reset: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  alert: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toast },
}))
vi.mock('@/lib/env/client', () => ({
  publicEnv: { NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true' },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/features/auth/services/auth.service', () => ({
  authService: {
    loginWithPassword: mocks.login,
    signupWithPassword: mocks.signup,
    loginWithOAuth: mocks.oauth,
    resetPassword: mocks.reset,
  },
}))
vi.mock('@/features/auth/components/phone-auth-form', () => ({
  PhoneAuthForm: ({
    purpose,
    onVerified,
  }: {
    purpose: string
    onVerified: () => void
  }) => (
    <section aria-label={`Phone ${purpose}`}>
      <button onClick={onVerified}>Verify phone</button>
    </section>
  ),
}))
vi.mock('@/components/ui/skeleton-image', () => ({
  SkeletonImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}))
function renderPage(page: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {page}
    </NextIntlClientProvider>,
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.login.mockResolvedValue({ error: null })
  mocks.signup.mockResolvedValue({ error: null })
  mocks.oauth.mockResolvedValue({ error: null })
  mocks.reset.mockResolvedValue({ error: null })
  vi.stubGlobal('alert', mocks.alert)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each([
  { kind: 'login', Component: LoginPage, submit: mocks.login },
  { kind: 'signup', Component: SignupPage, submit: mocks.signup },
])('$kind page', ({ kind, Component, submit }) => {
  function selectEmailAuthentication() {
    fireEvent.click(screen.getByTestId(`${kind}-toggle-phone-button`))
  }

  function enterCredentials() {
    selectEmailAuthentication()
    fireEvent.change(screen.getByTestId(`${kind}-email-input`), {
      target: { value: 'person@example.test' },
    })
    fireEvent.change(screen.getByTestId(`${kind}-password-input`), {
      target: { value: 'test-password-123' },
    })
    if (kind === 'signup')
      fireEvent.change(screen.getByTestId('signup-name-input'), {
        target: { value: 'Test Person' },
      })
  }
  it('defaults to phone authentication and presents email as the secondary option', () => {
    renderPage(<Component />)
    expect(screen.getByRole('region', { name: `Phone ${kind}` })).toBeVisible()
    const toggle = screen.getByTestId(`${kind}-toggle-phone-button`)
    expect(toggle).toHaveTextContent(messages.PhoneAuth.useEmail)
    expect(toggle.querySelector('svg')).toBeInTheDocument()
    expect(toggle).toHaveClass('h-12', 'rounded-sm', 'font-normal')
  })
  it('requires email/password and reveals the password without submitting', () => {
    const { container } = renderPage(<Component />)
    selectEmailAuthentication()
    expect(screen.getByTestId(`${kind}-email-input`)).toBeRequired()
    const password = screen.getByTestId(`${kind}-password-input`)
    expect(password).toBeRequired()
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(container.querySelector('form button[type="button"]')!)
    expect(password).toHaveAttribute('type', 'text')
    fireEvent.click(container.querySelector('form button[type="button"]')!)
    expect(password).toHaveAttribute('type', 'password')
    expect(submit).not.toHaveBeenCalled()
  })
  it('submits entered credentials and navigates only after authentication succeeds', async () => {
    renderPage(<Component />)
    enterCredentials()
    fireEvent.click(screen.getByTestId(`${kind}-submit-button`))
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        kind === 'login' ? '/dashboard' : '/login',
      ),
    )
    if (kind === 'login')
      expect(submit).toHaveBeenCalledWith(
        'person@example.test',
        'test-password-123',
      )
    else {
      expect(submit).toHaveBeenCalledWith(
        'person@example.test',
        'test-password-123',
        'Test Person',
      )
      expect(mocks.alert).toHaveBeenCalledWith(
        messages.Auth.checkEmailConfirmation,
      )
    }
  })
  it('disables repeated submissions until the pending request finishes', async () => {
    let finish!: (value: { error: null }) => void
    submit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    renderPage(<Component />)
    enterCredentials()
    fireEvent.click(screen.getByTestId(`${kind}-submit-button`))
    expect(screen.getByTestId(`${kind}-submit-button`)).toBeDisabled()
    expect(screen.getByTestId(`${kind}-submit-button`)).toHaveTextContent(
      kind === 'login'
        ? messages.Auth.signingIn
        : messages.Auth.creatingAccount,
    )
    finish({ error: null })
    await waitFor(() =>
      expect(screen.getByTestId(`${kind}-submit-button`)).toBeEnabled(),
    )
  })
  it.each(['returned', 'thrown', 'non-error'])(
    'reports %s authentication failures and permits retry',
    async (failure) => {
      if (failure === 'returned')
        submit.mockResolvedValueOnce({
          error: {
            code: 'invalid_credentials',
            message: 'Invalid credentials',
          },
        })
      else
        submit.mockRejectedValueOnce(
          failure === 'thrown'
            ? new Error('Invalid credentials')
            : 'Invalid credentials',
        )
      renderPage(<Component />)
      enterCredentials()
      fireEvent.click(screen.getByTestId(`${kind}-submit-button`))
      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          title: messages.Auth.errorTitle,
          description:
            failure === 'returned'
              ? messages.Auth.errors.invalidCredentials
              : messages.Auth.errors.unavailable,
          type: 'error',
        }),
      )
      expect(mocks.alert).not.toHaveBeenCalled()
      expect(mocks.push).not.toHaveBeenCalled()
      expect(screen.getByTestId(`${kind}-submit-button`)).toBeEnabled()
      expect(screen.getByTestId(`${kind}-email-input`)).toHaveValue(
        'person@example.test',
      )
    },
  )
  it('switches to phone authentication and routes verified users to dashboard', () => {
    renderPage(<Component />)
    expect(screen.getByRole('region', { name: `Phone ${kind}` })).toBeVisible()
    fireEvent.click(screen.getByTestId(`${kind}-toggle-phone-button`))
    expect(screen.queryByRole('region', { name: `Phone ${kind}` })).toBeNull()
    expect(screen.getByTestId(`${kind}-email-input`)).toBeVisible()
    fireEvent.click(screen.getByTestId(`${kind}-toggle-phone-button`))
    expect(screen.getByRole('region', { name: `Phone ${kind}` })).toBeVisible()
    expect(screen.queryByTestId(`${kind}-email-input`)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }))
    expect(mocks.replace).toHaveBeenCalledWith('/dashboard')
    fireEvent.click(screen.getByTestId(`${kind}-toggle-phone-button`))
    expect(screen.getByTestId(`${kind}-email-input`)).toBeVisible()
  })
  it.each(['google', 'facebook'] as const)(
    'starts %s OAuth without password authentication',
    async (provider) => {
      renderPage(<Component />)
      fireEvent.click(
        screen.getByRole('button', {
          name:
            provider === 'google'
              ? messages.Common.google
              : messages.Common.facebook,
        }),
      )
      await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith(provider))
      expect(submit).not.toHaveBeenCalled()
      expect(mocks.alert).not.toHaveBeenCalled()
      expect(mocks.toast).not.toHaveBeenCalled()
    },
  )
  it.each(['returned', 'thrown', 'non-error'])(
    'reports %s OAuth errors',
    async (failure) => {
      if (failure === 'returned')
        mocks.oauth.mockResolvedValueOnce({
          error: { message: 'OAuth unavailable' },
        })
      else
        mocks.oauth.mockRejectedValueOnce(
          failure === 'thrown'
            ? new Error('OAuth unavailable')
            : 'OAuth unavailable',
        )
      renderPage(<Component />)
      fireEvent.click(
        screen.getByRole('button', { name: messages.Common.google }),
      )
      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          title: messages.Auth.errorTitle,
          description: messages.Auth.errors.unavailable,
          type: 'error',
        }),
      )
      expect(mocks.alert).not.toHaveBeenCalled()
      expect(mocks.push).not.toHaveBeenCalled()
    },
  )
})

describe('forgot password page', () => {
  it('requires an email and links back to login', () => {
    renderPage(<ForgotPasswordPage />)
    expect(screen.getByTestId('forgot-password-email-input')).toBeRequired()
    expect(
      screen.getByRole('link', { name: messages.Auth.backToLogin }),
    ).toHaveAttribute('href', '/login')
  })
  it('sends a reset request and replaces the form with confirmation for the entered address', async () => {
    renderPage(<ForgotPasswordPage />)
    fireEvent.change(screen.getByTestId('forgot-password-email-input'), {
      target: { value: 'person@example.test' },
    })
    fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
    await waitFor(() =>
      expect(
        screen.getByTestId('forgot-password-sent-confirmation'),
      ).toBeVisible(),
    )
    expect(mocks.reset).toHaveBeenCalledWith('person@example.test')
    expect(screen.getByText('person@example.test')).toBeVisible()
    expect(
      screen.queryByTestId('forgot-password-email-input'),
    ).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument()
  })
  it('shows pending state and re-enables controls after a rejected reset request', async () => {
    let fail!: (reason: Error) => void
    mocks.reset.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    renderPage(<ForgotPasswordPage />)
    fireEvent.change(screen.getByTestId('forgot-password-email-input'), {
      target: { value: 'person@example.test' },
    })
    fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
    expect(screen.getByTestId('forgot-password-submit-button')).toBeDisabled()
    expect(
      screen.getByTestId('forgot-password-submit-button'),
    ).toHaveTextContent(messages.Auth.sending)
    fail(new Error('Reset unavailable'))
    await waitFor(() =>
      expect(mocks.alert).toHaveBeenCalledWith('Reset unavailable'),
    )
    expect(screen.getByTestId('forgot-password-submit-button')).toBeEnabled()
    expect(
      screen.queryByTestId('forgot-password-sent-confirmation'),
    ).not.toBeInTheDocument()
  })
  it.each(['returned', 'non-error'])(
    'reports %s reset errors without claiming success',
    async (failure) => {
      if (failure === 'returned')
        mocks.reset.mockResolvedValueOnce({
          error: { message: 'Reset unavailable' },
        })
      else mocks.reset.mockRejectedValueOnce('Unexpected rejection')
      renderPage(<ForgotPasswordPage />)
      fireEvent.change(screen.getByTestId('forgot-password-email-input'), {
        target: { value: 'person@example.test' },
      })
      fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
      await waitFor(() =>
        expect(mocks.alert).toHaveBeenCalledWith(
          failure === 'returned'
            ? 'Reset unavailable'
            : messages.Auth.unknownError,
        ),
      )
      expect(
        screen.queryByTestId('forgot-password-sent-confirmation'),
      ).not.toBeInTheDocument()
    },
  )
})
