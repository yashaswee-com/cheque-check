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
  it.each([
    ['Windows snipping', { key: 'Shift', metaKey: true, shiftKey: true }],
    ['macOS capture', { key: '4', metaKey: true, shiftKey: true }],
  ])('covers as soon as a %s shortcut begins', (_label, init) => {
    vi.useFakeTimers()
    mount()
    fireEvent.keyDown(window, init)
    expect(screen.getByTestId('privacy-cover')).toBeVisible()
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
  })
  it('ignores ordinary shortcuts that are not capture paths', () => {
    mount()
    fireEvent.keyDown(window, { key: 'S', metaKey: true })
    fireEvent.keyDown(window, { key: 'C', ctrlKey: true, shiftKey: true })
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
  })
  it('blocks the print shortcut and covers content while printing', () => {
    const view = mount()
    expect(document.documentElement).toHaveAttribute('data-privacy-cover')
    const event = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    fireEvent(window, new Event('beforeprint'))
    expect(screen.getByTestId('privacy-cover')).toBeVisible()
    fireEvent(window, new Event('afterprint'))
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
    view.unmount()
    expect(document.documentElement).not.toHaveAttribute('data-privacy-cover')
  })
  it('respects a disabled profile preference and removes event listeners', () => {
    state.enabled = false
    const view = mount()
    fireEvent(window, new Event('blur'))
    fireEvent.keyDown(window, { key: 'PrintScreen' })
    fireEvent(window, new Event('beforeprint'))
    const print = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      cancelable: true,
    })
    window.dispatchEvent(print)
    expect(print.defaultPrevented).toBe(false)
    expect(document.documentElement).not.toHaveAttribute('data-privacy-cover')
    expect(screen.getByTestId('privacy-cover')).not.toBeVisible()
    view.unmount()
    expect(screen.queryByTestId('privacy-cover')).not.toBeInTheDocument()
  })
  it('persists only a user-requested preference and explicitly reports failed saves', async () => {
    state.update.mockRejectedValue(new Error('Offline'))
    mount(<PrivacyPreference />)
    expect(
      screen.queryByText(messages.Security.privacyLimit),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'More about Hide app when out of focus',
      }),
    )
    expect(
      await screen.findByText(messages.Security.privacyLimit),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({ privacy_cover: false }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('switch')).toBeChecked()
  })
  it('uses the same responsive frame as the shell rather than painting the blue surround', () => {
    mount()
    expect(screen.getByTestId('privacy-cover')).toHaveClass('bg-primary')
    expect(screen.getByTestId('privacy-cover-frame')).toHaveClass(
      'app-shell-frame',
      'overflow-hidden',
      'bg-white',
      'dark:bg-black',
    )
    expect(screen.getByTestId('privacy-cover')).not.toHaveClass(
      'bg-white',
      'dark:bg-black',
    )
    fireEvent(window, new Event('blur'))
    expect(screen.getByTestId('privacy-cover-frame')).toBeVisible()
  })
})
