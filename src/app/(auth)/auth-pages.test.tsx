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
import hindiMessages from '../../../messages/hi.json'
import hinglishMessages from '../../../messages/hi-en.json'
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
  env: {
    NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined as string | undefined,
  },
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toast },
}))
vi.mock('@/lib/env/client', () => ({
  publicEnv: mocks.env,
}))
vi.mock('@/features/auth/components/turnstile-widget', () => ({
  TurnstileWidget: ({
    action,
    onToken,
  }: {
    action: string
    onToken: (token: string | null) => void
  }) => (
    <section data-testid="turnstile-widget" aria-label={action}>
      <button type="button" onClick={() => onToken('email-captcha-token')}>
        Complete security check
      </button>
      <button type="button" onClick={() => onToken(null)}>
        Expire security check
      </button>
    </section>
  ),
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
  mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = undefined
  mocks.login.mockResolvedValue({ error: null })
  mocks.signup.mockResolvedValue({ error: null })
  mocks.oauth.mockResolvedValue({ error: null })
  mocks.reset.mockResolvedValue({ error: null })
  vi.stubGlobal('alert', mocks.alert)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe.each([
  { locale: 'en', translations: messages },
  { locale: 'hi', translations: hindiMessages },
  { locale: 'hi-en', translations: hinglishMessages },
])('shared authentication tagline ($locale)', ({ locale, translations }) => {
  it.each([LoginPage, SignupPage, ForgotPasswordPage])(
    'renders the localized tagline on %s',
    (Component) => {
      render(
        <NextIntlClientProvider locale={locale} messages={translations}>
          <Component />
        </NextIntlClientProvider>,
      )
      expect(screen.getByText(translations.Auth.tagline)).toBeVisible()
    },
  )
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
  it('returns to the public homepage using the back button', () => {
    renderPage(<Component />)
    fireEvent.click(screen.getByRole('button', { name: messages.Common.back }))
    expect(mocks.push).toHaveBeenCalledWith('/')
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
  it('places decorative field icons beside their labels, not inside inputs', () => {
    renderPage(<Component />)
    selectEmailAuthentication()
    const labels = [
      messages.Auth.email,
      messages.Auth.password,
      ...(kind === 'signup' ? [messages.Common.fullName] : []),
    ]
    for (const text of labels) {
      const label = screen.getByText(text, { selector: 'label' })
      expect(label.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      const input = screen.getByLabelText(text)
      expect(input.parentElement?.querySelector('svg')).not.toBeInTheDocument()
    }
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
        undefined,
      )
    else {
      expect(submit).toHaveBeenCalledWith(
        'person@example.test',
        'test-password-123',
        'Test Person',
        undefined,
      )
      expect(mocks.alert).toHaveBeenCalledWith(
        messages.Auth.checkEmailConfirmation,
      )
    }
  })
  it('requires a fresh CAPTCHA token for email authentication and preserves phone mode', async () => {
    mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'public-site-key'
    submit.mockResolvedValue({ error: { code: 'captcha_failed' } })
    renderPage(<Component />)
    expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument()
    enterCredentials()
    expect(screen.getByTestId('turnstile-widget')).toHaveAttribute(
      'aria-label',
      `email_${kind}`,
    )
    const button = screen.getByTestId(`${kind}-submit-button`)
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.Auth.errorTitle,
      description: messages.Auth.errors.captchaFailed,
      type: 'error',
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete security check' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Expire security check' }),
    )
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete security check' }),
    )
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeEnabled())
    expect(submit).toHaveBeenCalledWith(
      'person@example.test',
      'test-password-123',
      ...(kind === 'signup' ? ['Test Person'] : []),
      'email-captcha-token',
    )
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledOnce()
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete security check' }),
    )
    selectEmailAuthentication()
    selectEmailAuthentication()
    fireEvent.click(screen.getByTestId(`${kind}-submit-button`))
    expect(submit).toHaveBeenCalledOnce()
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
      kind === 'login' ? messages.Auth.signIn : messages.Auth.createAccount,
    )
    expect(screen.getByTestId(`${kind}-submit-button`)).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(
      screen
        .getByTestId(`${kind}-submit-button`)
        .querySelectorAll('.animate-spin'),
    ).toHaveLength(1)
    fireEvent.submit(
      screen.getByTestId(`${kind}-submit-button`).closest('form')!,
    )
    expect(submit).toHaveBeenCalledOnce()
    finish({ error: null })
    await waitFor(() =>
      expect(screen.getByTestId(`${kind}-submit-button`)).toBeEnabled(),
    )
  })
  it('tracks the selected OAuth button until authentication completes', async () => {
    const task = Promise.withResolvers<{ error: null }>()
    mocks.oauth.mockReturnValueOnce(task.promise)
    renderPage(<Component />)
    const button = screen.getByRole('button', { name: messages.Common.google })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button.querySelectorAll('.animate-spin')).toHaveLength(1)
    fireEvent.click(button)
    expect(mocks.oauth).toHaveBeenCalledOnce()
    task.resolve({ error: null })
    await waitFor(() => expect(button).toBeEnabled())
    expect(button).not.toHaveAttribute('aria-busy')
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

describe('login return path', () => {
  it('continues a validated internal checkout destination after authentication', async () => {
    window.history.replaceState(
      {},
      '',
      '/login?next=%2Ffeatures%2Fcatalog%3Fpurchase%3Dlifetime_premium',
    )
    renderPage(<LoginPage />)
    fireEvent.click(screen.getByTestId('login-toggle-phone-button'))
    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'buyer@example.test' },
    })
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByTestId('login-submit-button'))

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/features/catalog?purchase=lifetime_premium',
      ),
    )
  })

  it('rejects external redirect targets', async () => {
    window.history.replaceState({}, '', '/login?next=%2F%2Fexample.test')
    renderPage(<LoginPage />)
    fireEvent.click(screen.getByTestId('login-toggle-phone-button'))
    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'buyer@example.test' },
    })
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByTestId('login-submit-button'))

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('forgot password page', () => {
  it('returns to login using the top back button', () => {
    renderPage(<ForgotPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: messages.Common.back }))
    expect(mocks.push).toHaveBeenCalledWith('/login')
  })
  it('requires a CAPTCHA token for recovery and consumes it after a thrown failure', async () => {
    mocks.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'public-site-key'
    mocks.reset.mockRejectedValueOnce(new Error('private provider details'))
    renderPage(<ForgotPasswordPage />)
    fireEvent.change(screen.getByTestId('forgot-password-email-input'), {
      target: { value: 'person@example.test' },
    })
    expect(screen.getByTestId('turnstile-widget')).toHaveAttribute(
      'aria-label',
      'email_reset',
    )
    fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
    expect(mocks.reset).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete security check' }),
    )
    fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
    await waitFor(() =>
      expect(screen.getByTestId('forgot-password-submit-button')).toBeEnabled(),
    )
    expect(mocks.reset).toHaveBeenCalledWith(
      'person@example.test',
      'email-captcha-token',
    )
    fireEvent.click(screen.getByTestId('forgot-password-submit-button'))
    expect(mocks.reset).toHaveBeenCalledOnce()
    expect(mocks.alert).not.toHaveBeenCalled()
    expect(
      screen.queryByTestId('forgot-password-sent-confirmation'),
    ).not.toBeInTheDocument()
  })

  it('requires an email and links back to login', () => {
    renderPage(<ForgotPasswordPage />)
    expect(screen.getByTestId('forgot-password-email-input')).toBeRequired()
    expect(
      screen
        .getByText(messages.Auth.email, { selector: 'label' })
        .querySelector('svg'),
    ).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen
        .getByTestId('forgot-password-email-input')
        .parentElement?.querySelector('svg'),
    ).not.toBeInTheDocument()
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
    expect(mocks.reset).toHaveBeenCalledWith('person@example.test', undefined)
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
    ).toHaveTextContent(messages.Auth.sendResetLink)
    expect(screen.getByTestId('forgot-password-submit-button')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(
      screen
        .getByTestId('forgot-password-submit-button')
        .querySelectorAll('.animate-spin'),
    ).toHaveLength(1)
    fail(new Error('Reset unavailable'))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Auth.errorTitle,
        description: messages.Auth.errors.unavailable,
        type: 'error',
      }),
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
        expect(mocks.toast).toHaveBeenCalledWith({
          title: messages.Auth.errorTitle,
          description: messages.Auth.errors.unavailable,
          type: 'error',
        }),
      )
      expect(
        screen.queryByTestId('forgot-password-sent-confirmation'),
      ).not.toBeInTheDocument()
    },
  )
})
