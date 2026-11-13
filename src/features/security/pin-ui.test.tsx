import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import { PinGate } from './components/pin-gate'
import { PinSettings } from './components/pin-settings'
import { SecurityError } from './types'
import { PIN_CHANGED_EVENT } from './hooks/use-pin-security'
import { queryKeys } from '@/lib/query-keys'
import { renderToString } from 'react-dom/server'
import { logger } from '@/lib/logger'
const mocks = vi.hoisted(() => ({
  owner: 'user',
  status: vi.fn(),
  verify: vi.fn(),
  password: vi.fn(),
  sendOtp: vi.fn(),
  otp: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  timeout: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  mounted: vi.fn(),
  siteKey: '',
}))
vi.mock('@/lib/env/client', () => ({
  publicEnv: {
    get NEXT_PUBLIC_TURNSTILE_SITE_KEY() {
      return mocks.siteKey
    },
  },
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { user_id: mocks.owner }, isLoading: false }),
}))
vi.mock('./repositories/security.repository', () => ({
  securityRepository: mocks,
}))
vi.mock('@/features/auth/services/auth.service', () => ({
  authService: { signOut: mocks.signOut },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
const revision = '10000000-0000-4000-8000-000000000001'
const enabled = {
  enabled: true,
  blocked: false,
  revision,
  emailOtp: true,
  phoneOtp: false,
  lockTimeoutSeconds: 60,
}
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.owner = 'user'
  mocks.siteKey = ''
  mocks.status.mockResolvedValue(enabled)
  mocks.verify.mockResolvedValue({ status: 'unlocked', revision })
  mocks.password.mockResolvedValue({ proof: 'a'.repeat(64) })
  mocks.otp.mockResolvedValue({ proof: 'a'.repeat(64) })
  mocks.sendOtp.mockResolvedValue({ sent: true })
  mocks.set.mockResolvedValue({ saved: true })
  mocks.remove.mockResolvedValue({ saved: true })
  mocks.timeout.mockResolvedValue({ saved: true })
  mocks.signOut.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function Financial() {
  mocks.mounted()
  return <p>Financial records</p>
}
function mount(
  child = (
    <PinGate>
      <Financial />
    </PinGate>
  ),
) {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {child}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
async function unlock() {
  fireEvent.change(await screen.findByLabelText('Enter six-digit PIN'), {
    target: { value: '123456' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  await screen.findByText('Financial records')
}
describe('PIN shell gating', () => {
  it('never renders financial HTML on the server before the browser verifies security', () => {
    const html = renderToString(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <PinGate>
            <Financial />
          </PinGate>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(html).not.toContain('Financial records')
    expect(mocks.mounted).not.toHaveBeenCalled()
  })
  it('does not trust a cached disabled status on a new app mount', async () => {
    client.setQueryData(queryKeys.security.status(mocks.owner), {
      ...enabled,
      enabled: false,
    })
    let resolve!: (value: typeof enabled) => void
    mocks.status.mockReturnValue(
      new Promise<typeof enabled>((done) => {
        resolve = done
      }),
    )
    mount()
    expect(mocks.mounted).not.toHaveBeenCalled()
    await act(async () => resolve(enabled))
    expect(
      await screen.findByLabelText('Enter six-digit PIN'),
    ).toBeInTheDocument()
    expect(mocks.mounted).not.toHaveBeenCalled()
  })
  it('shows only the hint and spinner while security status loads', async () => {
    let resolve!: (value: typeof enabled) => void
    mocks.status.mockReturnValue(
      new Promise<typeof enabled>((done) => {
        resolve = done
      }),
    )
    mount()
    const checking = await screen.findByTestId('pin-gate-checking')
    expect(checking).toHaveAttribute('role', 'status')
    expect(checking.querySelector('svg.animate-spin')).not.toBeNull()
    const [description] = checking.querySelectorAll('p')
    expect(checking).not.toHaveTextContent(messages.Security.checking)
    expect(description).toHaveTextContent(messages.Security.checkingHints[0])
    expect(description).toHaveClass('text-muted-foreground')
    expect(screen.getByText('ChequeCheck')).toHaveClass('sr-only')
    expect(screen.getByRole('dialog')).toHaveAccessibleName('ChequeCheck')
    await act(async () => resolve(enabled))
    expect(
      await screen.findByLabelText('Enter six-digit PIN'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pin-gate-checking')).not.toBeInTheDocument()
    expect(screen.getByText('ChequeCheck')).not.toHaveClass('sr-only')
  })
  it('rotates to a different security hint after a random 3–5 second delay', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    mocks.status.mockReturnValue(new Promise<typeof enabled>(() => {}))

    mount()
    const checking = screen.getByTestId('pin-gate-checking')
    const hint = checking.querySelector('p')
    expect(hint).toHaveTextContent(messages.Security.checkingHints[0])

    act(() => vi.advanceTimersByTime(3199))
    expect(hint).toHaveTextContent(messages.Security.checkingHints[0])
    act(() => vi.advanceTimersByTime(1))
    expect(hint).toHaveTextContent(messages.Security.checkingHints[1])
  })
  it('traps keyboard focus and never dismisses the lock on Escape', async () => {
    mount()
    await screen.findByLabelText('Enter six-digit PIN')
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
      true,
    )
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.mounted).not.toHaveBeenCalled()
  })
  it('never mounts financial children until online verification succeeds and reload locks again', async () => {
    const view = mount()
    await screen.findByLabelText('Enter six-digit PIN')
    expect(mocks.mounted).not.toHaveBeenCalled()
    await unlock()
    expect(mocks.verify).toHaveBeenCalledWith('123456')
    view.unmount()
    mount()
    expect(
      await screen.findByLabelText('Enter six-digit PIN'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
  })
  it('allows opt-out accounts only after reading authoritative status', async () => {
    mocks.status.mockResolvedValue({ ...enabled, enabled: false })
    mount()
    expect(await screen.findByText('Financial records')).toBeInTheDocument()
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('keeps background sessions under 60 seconds unlocked, locks at the exact threshold', async () => {
    mount()
    await unlock()
    vi.useFakeTimers()
    fireEvent(window, new Event('blur'))
    act(() => vi.advanceTimersByTime(59999))
    expect(screen.getByText('Financial records')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Enter six-digit PIN')).toBeInTheDocument()
    vi.useRealTimers()
  })
  it('locks after the server-configured timeout instead of the one-minute default', async () => {
    mocks.status.mockResolvedValue({ ...enabled, lockTimeoutSeconds: 300 })
    mount()
    await unlock()
    vi.useFakeTimers()
    fireEvent(window, new Event('blur'))
    act(() => vi.advanceTimersByTime(299999))
    expect(screen.getByText('Financial records')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
  it('uses elapsed wall time on focus when suspended timers cannot run', async () => {
    mount()
    await unlock()
    let now = Date.now()
    const start = now
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    fireEvent(window, new Event('blur'))
    now = start + 60000
    fireEvent(window, new Event('focus'))
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
  })
  it('shows incorrect attempts and signs out on server-enforced fifth failure', async () => {
    mocks.verify
      .mockResolvedValueOnce({ status: 'incorrect', remaining: 4 })
      .mockResolvedValueOnce({ status: 'blocked', remaining: 0 })
    mount()
    const input = await screen.findByLabelText('Enter six-digit PIN')
    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect PIN')
    expect(screen.getByText('Attempts remaining: 4')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1))
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.mounted).not.toHaveBeenCalled()
  })
  it('fails closed offline and can retry; no localStorage value bypasses the gate', async () => {
    localStorage.setItem('pin-unlocked', 'true')
    mocks.status.mockRejectedValueOnce(new SecurityError('unavailable'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
    expect(mocks.mounted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByLabelText('Enter six-digit PIN')
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
    localStorage.removeItem('pin-unlocked')
  })
  it('invalidates unlock when another tab changes the PIN or the account changes', async () => {
    const view = mount()
    await unlock()
    fireEvent(window, new Event(PIN_CHANGED_EVENT))
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
    await unlock()
    mocks.owner = 'other'
    view.rerender(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <PinGate>
            <Financial />
          </PinGate>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByText('Financial records')).not.toBeInTheDocument()
  })
  it('leaves failed signout explicitly locked and retryable', async () => {
    mocks.verify.mockResolvedValue({ status: 'blocked', remaining: 0 })
    mocks.signOut.mockRejectedValue(new Error('Offline'))
    mount()
    fireEvent.change(await screen.findByLabelText('Enter six-digit PIN'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out could not complete',
    )
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.mounted).not.toHaveBeenCalled()
  })
})
describe('fresh-auth PIN management', () => {
  async function begin(name: string) {
    fireEvent.click(await screen.findByRole('button', { name }))
  }
  async function password(action = 'Change passcode') {
    await begin(action)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use an app password instead',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Verify account' }),
      ).toBeEnabled(),
    )
    fireEvent.change(screen.getByLabelText('Account password'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify account' }))
    await screen.findByLabelText('New six-digit PIN')
  }
  it('requires fresh authentication, confirmation and saves no plaintext locally', async () => {
    mount(<PinSettings />)
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
    await password()
    fireEvent.change(screen.getByLabelText('New six-digit PIN'), {
      target: { value: '123456' },
    })
    fireEvent.change(screen.getByLabelText('Confirm PIN'), {
      target: { value: '654321' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('matching PIN')
    expect(mocks.set).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Confirm PIN'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    await waitFor(() =>
      expect(mocks.set).toHaveBeenCalledWith('a'.repeat(64), '123456'),
    )
    expect(await screen.findByText('PIN preference saved.')).toBeInTheDocument()
    expect(localStorage.getItem('pin')).toBeNull()
  })
  it('allows fresh OTP authentication and removal without deleting account data', async () => {
    mount(<PinSettings recovery />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send verified-email code' }),
    )
    fireEvent.change(await screen.findByLabelText('Authentication code'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify account' }))
    await screen.findByLabelText('New six-digit PIN')
    fireEvent.click(screen.getByRole('button', { name: 'Remove PIN' }))
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('a'.repeat(64)),
    )
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it.each([
    ['phone', false, true, 'Send verified-phone code'],
    ['email', true, false, 'Send verified-email code'],
  ] as const)(
    'supports passwordless %s setup without asking for an app or Google password',
    async (channel, emailOtp, phoneOtp, name) => {
      mocks.status.mockResolvedValue({
        ...enabled,
        emailOtp,
        phoneOtp,
        enabled: false,
      })
      mount(<PinSettings />)
      await begin('Turn passcode on')
      fireEvent.click(await screen.findByRole('button', { name }))
      expect(
        screen.queryByLabelText('Account password'),
      ).not.toBeInTheDocument()
      fireEvent.change(await screen.findByLabelText('Authentication code'), {
        target: { value: '123456' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Verify account' }))
      fireEvent.change(await screen.findByLabelText('New six-digit PIN'), {
        target: { value: '654321' },
      })
      fireEvent.change(screen.getByLabelText('Confirm PIN'), {
        target: { value: '654321' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
      await waitFor(() =>
        expect(mocks.set).toHaveBeenCalledWith('a'.repeat(64), '654321'),
      )
      expect(mocks.sendOtp).toHaveBeenCalledWith(channel, undefined)
      expect(mocks.otp).toHaveBeenCalledWith(channel, '123456')
      expect(mocks.password).not.toHaveBeenCalled()
    },
  )
  it('does not expose unsupported verification choices', async () => {
    mocks.status.mockResolvedValue({
      ...enabled,
      emailOtp: false,
      phoneOtp: false,
    })
    mount(<PinSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No supported verified identity',
    )
    expect(
      screen.getByRole('button', { name: 'Change passcode' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Turn passcode off' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Send verified/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Use an app password instead' }),
    ).not.toBeInTheDocument()
  })
  it('reports failed OTP delivery and verification without granting a mutation proof', async () => {
    mocks.sendOtp.mockRejectedValueOnce(new SecurityError('delivery_failed'))
    mount(<PinSettings />)
    await begin('Change passcode')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send verified-email code' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send the verification code',
    )
    expect(
      screen.queryByLabelText('Authentication code'),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verified-email code' }),
    )
    fireEvent.change(await screen.findByLabelText('Authentication code'), {
      target: { value: '123456' },
    })
    mocks.otp.mockRejectedValueOnce(new SecurityError('verification_failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Verify account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account verification failed',
    )
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it.each([
    ['email', 'Send verified-email code'],
    ['phone', 'Send verified-phone code'],
  ] as const)(
    'requires a fresh CAPTCHA for %s sends and retries without blocking OTP-code verification',
    async (channel, name) => {
      mocks.siteKey = 'site-key'
      mocks.status.mockResolvedValue({
        ...enabled,
        emailOtp: channel === 'email',
        phoneOtp: channel === 'phone',
      })
      const renderWidget = vi.fn<NonNullable<Window['turnstile']>['render']>(
        () => 'widget',
      )
      const remove = vi.fn()
      vi.stubGlobal('turnstile', { render: renderWidget, remove })
      mocks.sendOtp.mockRejectedValueOnce(new SecurityError('captcha_failed'))
      mount(<PinSettings />)
      await begin('Change passcode')
      const send = screen.getByRole('button', { name })
      expect(send).toBeDisabled()
      fireEvent.click(send)
      expect(mocks.sendOtp).not.toHaveBeenCalled()
      await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
      expect(renderWidget.mock.calls[0][1].action).toBe('security_pin')
      act(() => renderWidget.mock.calls[0][1].callback('expired-captcha'))
      expect(send).toBeEnabled()
      act(() => renderWidget.mock.calls[0][1]['expired-callback']())
      expect(send).toBeDisabled()
      act(() => renderWidget.mock.calls[0][1].callback('error-captcha'))
      act(() => renderWidget.mock.calls[0][1]['error-callback']())
      expect(send).toBeDisabled()
      act(() => renderWidget.mock.calls[0][1].callback('first-captcha'))
      fireEvent.click(send)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        messages.Security.captcha_failed,
      )
      expect(mocks.sendOtp).toHaveBeenCalledWith(channel, 'first-captcha')
      expect(logger.warn).toHaveBeenCalledWith(
        'PIN preference verification rejected',
        { code: 'captcha_failed' },
      )
      expect(logger.error).not.toHaveBeenCalled()
      await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2))
      expect(remove).toHaveBeenCalled()
      expect(send).toBeDisabled()
      act(() => renderWidget.mock.calls[1][1].callback('retry-captcha'))
      fireEvent.click(send)
      const code = await screen.findByLabelText('Authentication code')
      expect(mocks.sendOtp).toHaveBeenLastCalledWith(channel, 'retry-captcha')
      await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(3))
      expect(send).toBeDisabled()
      fireEvent.change(code, { target: { value: '123456' } })
      const verify = screen.getByRole('button', { name: 'Verify account' })
      expect(verify).toBeEnabled()
      fireEvent.click(verify)
      expect(
        await screen.findByLabelText('New six-digit PIN'),
      ).toBeInTheDocument()
      expect(mocks.otp).toHaveBeenCalledWith(channel, '123456')
    },
  )
  it('requires and resets CAPTCHA tokens for password verification after both failure and success', async () => {
    mocks.siteKey = 'site-key'
    const renderWidget = vi.fn<NonNullable<Window['turnstile']>['render']>(
      () => 'widget',
    )
    vi.stubGlobal('turnstile', { render: renderWidget, remove: vi.fn() })
    mocks.password.mockRejectedValueOnce(
      new SecurityError('verification_failed'),
    )
    mount(<PinSettings />)
    await begin('Change passcode')
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
    act(() => renderWidget.mock.calls[0][1].callback('unused-captcha'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Use an app password instead' }),
    )
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2))
    const password = screen.getByLabelText('Account password')
    fireEvent.change(password, { target: { value: 'account-password' } })
    const verify = screen.getByRole('button', { name: 'Verify account' })
    expect(verify).toBeDisabled()
    fireEvent.submit(password.closest('form')!)
    expect(mocks.password).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.Security.captcha_failed,
    )
    act(() => renderWidget.mock.calls[1][1].callback('password-captcha'))
    fireEvent.click(verify)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.Security.verification_failed,
    )
    expect(mocks.password).toHaveBeenCalledWith(
      'account-password',
      'password-captcha',
    )
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(3))
    expect(verify).toBeDisabled()
    act(() => renderWidget.mock.calls[2][1].callback('retry-password-captcha'))
    fireEvent.click(verify)
    expect(
      await screen.findByLabelText('New six-digit PIN'),
    ).toBeInTheDocument()
    expect(mocks.password).toHaveBeenLastCalledWith(
      'account-password',
      'retry-password-captcha',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await begin('Change passcode')
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(4))
    expect(
      screen.getByRole('button', { name: 'Send verified-email code' }),
    ).toBeDisabled()
  })
  it('expired fresh proof requires new verification instead of optimistic success', async () => {
    mocks.set.mockRejectedValue(new SecurityError('fresh_auth_required'))
    mount(<PinSettings />)
    await password()
    fireEvent.change(screen.getByLabelText('New six-digit PIN'), {
      target: { value: '123456' },
    })
    fireEvent.change(screen.getByLabelText('Confirm PIN'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('expired')
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
    expect(screen.queryByText('PIN preference saved.')).not.toBeInTheDocument()
  })
  it('shows an On status card with change, turn off and require-passcode options', async () => {
    mount(<PinSettings />)
    expect(await screen.findByTestId('pin-status-badge')).toHaveTextContent(
      'On',
    )
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.closest('[data-testid="pin-actions"]'))
        .map((button) => button.textContent),
    ).toEqual(['Change passcode', 'Turn passcode off'])
    const group = screen.getByRole('radiogroup', { name: 'Require passcode' })
    expect(
      Array.from(group.querySelectorAll('[role="radio"]')).map(
        (radio) => radio.textContent,
      ),
    ).toEqual([
      'After 1 minute',
      'After 5 minutes',
      'After 15 minutes',
      'After 1 hour',
    ])
    expect(screen.getByRole('radio', { name: 'After 1 minute' })).toBeChecked()
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
  })
  it('shows only Turn passcode on when the PIN is off', async () => {
    mocks.status.mockResolvedValue({ ...enabled, enabled: false })
    mount(<PinSettings />)
    expect(await screen.findByTestId('pin-status-badge')).toHaveTextContent(
      'Off',
    )
    expect(
      screen.getByRole('button', { name: 'Turn passcode on' }),
    ).toBeEnabled()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Change passcode' }),
    ).not.toBeInTheDocument()
  })
  it('saves the lock timeout without relocking the current session', async () => {
    const changed = vi.fn()
    window.addEventListener(PIN_CHANGED_EVENT, changed)
    try {
      mount(<PinSettings />)
      fireEvent.click(
        await screen.findByRole('radio', { name: 'After 15 minutes' }),
      )
      await waitFor(() => expect(mocks.timeout).toHaveBeenCalledWith(900))
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Lock timing saved.',
      )
      expect(
        screen.getByRole('radio', { name: 'After 15 minutes' }),
      ).toBeChecked()
      expect(changed).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(PIN_CHANGED_EVENT, changed)
    }
  })
  it('keeps the previous timeout and reports failures', async () => {
    mocks.timeout.mockRejectedValueOnce(new SecurityError('pin_disabled'))
    mount(<PinSettings />)
    fireEvent.click(await screen.findByRole('radio', { name: 'After 1 hour' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Turn the passcode on',
    )
    expect(screen.getByRole('radio', { name: 'After 1 minute' })).toBeChecked()
  })
  it('turns the passcode off only after fresh verification and confirmation', async () => {
    mount(<PinSettings />)
    await begin('Turn passcode off')
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use an app password instead',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Verify account' }),
      ).toBeEnabled(),
    )
    fireEvent.change(screen.getByLabelText('Account password'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify account' }))
    expect(
      await screen.findByText(/removes the PIN lock on every device/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
    mocks.status.mockResolvedValue({ ...enabled, enabled: false })
    fireEvent.click(screen.getByRole('button', { name: 'Turn passcode off' }))
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('a'.repeat(64)),
    )
    expect(await screen.findByTestId('pin-status-badge')).toHaveTextContent(
      'Off',
    )
    expect(screen.queryByTestId('pin-flow')).not.toBeInTheDocument()
  })
  it('cancel closes the flow and discards fresh proof', async () => {
    mount(<PinSettings />)
    await password()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('pin-flow')).not.toBeInTheDocument()
    await begin('Change passcode')
    expect(screen.queryByLabelText('New six-digit PIN')).not.toBeInTheDocument()
  })
})
