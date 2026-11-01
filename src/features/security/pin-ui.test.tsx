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
const mocks = vi.hoisted(() => ({
  owner: 'user',
  status: vi.fn(),
  verify: vi.fn(),
  password: vi.fn(),
  sendOtp: vi.fn(),
  otp: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  mounted: vi.fn(),
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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const revision = '10000000-0000-4000-8000-000000000001'
const enabled = {
  enabled: true,
  blocked: false,
  revision,
  emailOtp: true,
  phoneOtp: false,
}
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.owner = 'user'
  mocks.status.mockResolvedValue(enabled)
  mocks.verify.mockResolvedValue({ status: 'unlocked', revision })
  mocks.password.mockResolvedValue({ proof: 'a'.repeat(64) })
  mocks.otp.mockResolvedValue({ proof: 'a'.repeat(64) })
  mocks.sendOtp.mockResolvedValue({ sent: true })
  mocks.set.mockResolvedValue({ saved: true })
  mocks.remove.mockResolvedValue({ saved: true })
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
  async function password() {
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
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Verify account' })[1],
    )
    await screen.findByLabelText('New six-digit PIN')
    fireEvent.click(screen.getByRole('button', { name: 'Remove PIN' }))
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('a'.repeat(64)),
    )
    expect(mocks.set).not.toHaveBeenCalled()
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
})
