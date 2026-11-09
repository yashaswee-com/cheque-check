import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import { FirstRunTour } from './components/first-run-tour'
import { ReplayTour } from './components/replay-tour'
import { PostOnboardingTour } from './components/post-onboarding-tour'
import {
  captureInstallPrompt,
  clearInstallPrompt,
  INSTALL_DISMISSED_KEY,
} from '@/lib/pwa-install'
const mocks = vi.hoisted(() => ({
  status: 'pending' as 'pending' | 'completed' | 'skipped',
  update: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { user_id: 'user', tour_status: mocks.status },
    updateProfile: mocks.update,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = 'pending'
  mocks.update.mockResolvedValue(undefined)
  localStorage.clear()
  clearInstallPrompt()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 30,
    left: 20,
    top: 30,
    width: 100,
    height: 50,
    right: 120,
    bottom: 80,
    toJSON: () => ({}),
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount(child = <FirstRunTour />) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {['summary', 'add', 'scan', 'reports', 'settings'].map((target) => (
        <button key={target} data-tour={target} onClick={mocks.push}>
          {target}
        </button>
      ))}
      {child}
    </NextIntlClientProvider>,
  )
}
describe('first-run dashboard tour', () => {
  it('spotlights all six steps and persists completion only at Finish', async () => {
    mount()
    await screen.findByTestId('tour-spotlight')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Your dashboard summary',
    )
    for (let i = 0; i < 5; i++) {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveTextContent(
          `Step ${i + 2} of 6`,
        ),
      )
    }
    expect(screen.getByRole('dialog')).toHaveTextContent(
      messages.Tour.voice.body,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finish tour' })).toBeEnabled(),
    )
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Finish tour' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ tour_status: 'completed' }),
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('supports keyboard Escape as a durable skip and traps focus', async () => {
    mount()
    await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
      true,
    )
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ tour_status: 'skipped' }),
    )
  })
  it('does not reopen a finished or skipped tour', () => {
    mocks.status = 'completed'
    mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps failures explicit and retries without pretending completion', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Offline'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
  })
  it('replays only after successfully saving pending eligibility', async () => {
    mocks.status = 'skipped'
    mount(<ReplayTour />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Replay dashboard tour' }),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ tour_status: 'pending' }),
    )
    expect(mocks.push).toHaveBeenCalledWith('/dashboard')
  })
  it('does not navigate when replay persistence fails', async () => {
    mocks.update.mockRejectedValue(new Error('Offline'))
    mount(<ReplayTour />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Replay dashboard tour' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('blocks advancement when a spotlight target is missing but allows skipping', async () => {
    const view = mount()
    await screen.findByTestId('tour-spotlight')
    const target = view.container.querySelector('[data-tour="summary"]')!
    target.remove()
    try {
      expect(await screen.findByRole('status')).toHaveTextContent('Waiting')
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
      await waitFor(() =>
        expect(mocks.update).toHaveBeenCalledWith({ tour_status: 'skipped' }),
      )
    } finally {
      view.container.append(target)
    }
  })
  it('places the card opposite the spotlight without stacking a second transform', async () => {
    mount()
    await screen.findByTestId('tour-spotlight')
    const card = screen.getByTestId('tour-card')
    expect(card).toHaveAttribute('data-placement', 'bottom')
    expect(card.style.translate).toBe('-50% 0')
    expect(card.style.transform).toBe('')
    expect(card.style.top).toBe('auto')
    expect(card.style.bottom).toContain('safe-area-inset-bottom')
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      x: 20,
      y: window.innerHeight - 60,
      left: 20,
      top: window.innerHeight - 60,
      width: 100,
      height: 50,
      right: 120,
      bottom: window.innerHeight - 10,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(card).toHaveAttribute('data-placement', 'top'))
    expect(card.style.translate).toBe('-50% 0')
    expect(card.style.transform).toBe('')
    expect(card.style.top).toContain('safe-area-inset-top')
  })
  it('remeasures on resize and removes the spotlight on unmount', async () => {
    const view = mount()
    expect(await screen.findByTestId('tour-spotlight')).toHaveStyle({
      left: '16px',
    })
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      x: 80,
      y: 30,
      left: 80,
      top: 30,
      width: 100,
      height: 50,
      right: 180,
      bottom: 80,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))
    await waitFor(() =>
      expect(screen.getByTestId('tour-spotlight')).toHaveStyle({
        left: '76px',
      }),
    )
    view.unmount()
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
  })
  it('honors reduced motion when bringing spotlight targets into view', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    mount()
    await screen.findByTestId('tour-spotlight')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'center',
      behavior: 'instant',
    })
  })
})
describe('installation-before-tour sequencing', () => {
  function prompt(outcome: 'accepted' | 'dismissed') {
    captureInstallPrompt(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome }),
      }),
    )
  }
  it('waits for explicit install-card dismissal before showing tour', async () => {
    prompt('dismissed')
    mount(<PostOnboardingTour />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(Number(localStorage.getItem(INSTALL_DISMISSED_KEY))).toBeGreaterThan(
      Date.now(),
    )
  })
  it('does not equate accepted installation prompt with installation confirmation', async () => {
    prompt('accepted')
    mount(<PostOnboardingTour />)
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for installation',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent(window, new Event('appinstalled'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
  it('does not block the tour on unsupported browsers', async () => {
    mount(<PostOnboardingTour />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
  it('allows explicit dismissal if an accepted install never confirms', async () => {
    prompt('accepted')
    mount(<PostOnboardingTour />)
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await screen.findByRole('status')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Later' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
