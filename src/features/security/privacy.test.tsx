import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { PrivacyShield } from './components/privacy-shield'
import { PrivacyPreference } from './components/privacy-preference'
const state = vi.hoisted(() => ({ enabled: true, update: vi.fn() }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { privacy_cover: state.enabled },
    updateProfile: state.update,
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  state.enabled = true
  state.update.mockResolvedValue(undefined)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const mount = (child = <PrivacyShield />) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      {child}
    </NextIntlClientProvider>,
  )
describe('best-effort viewport privacy', () => {
  it('covers synchronously on blur and restores only when focused', () => {
    mount()
    const cover = screen.getByTestId('privacy-cover')
    expect(cover).not.toBeVisible()
    window.dispatchEvent(new Event('blur'))
    expect(cover.hidden).toBe(false)
    fireEvent(window, new Event('focus'))
    expect(cover).not.toBeVisible()
  })
  it('covers hidden tabs until visibility and focus return', () => {
    mount()
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.getByTestId('privacy-cover')).toBeVisible()
    visibility.mockReturnValue('visible')
    vi.mocked(document.hasFocus).mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.getByTestId('privacy-cover')).toBeVisible()
    vi.mocked(document.hasFocus).mockReturnValue(true)
    fireEvent(window, new Event('focus'))
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
  })
  it('briefly deters PrintScreen without claiming OS prevention or reading clipboard', () => {
    vi.useFakeTimers()
    mount()
    fireEvent.keyDown(window, { key: 'PrintScreen' })
    expect(screen.getByTestId('privacy-cover')).toBeVisible()
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
  })
  it('respects a disabled profile preference and removes event listeners', () => {
    state.enabled = false
    const view = mount()
    fireEvent(window, new Event('blur'))
    fireEvent.keyDown(window, { key: 'PrintScreen' })
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
    view.unmount()
    expect(screen.queryByTestId('privacy-cover')).not.toBeInTheDocument()
  })
  it('persists only a user-requested preference and explicitly reports failed saves', async () => {
    state.update.mockRejectedValue(new Error('Offline'))
    mount(<PrivacyPreference />)
    expect(screen.getByText(/Browsers cannot prevent OS/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({ privacy_cover: false }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('switch')).toBeChecked()
  })
})
