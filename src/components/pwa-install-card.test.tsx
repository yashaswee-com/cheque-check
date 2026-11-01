import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import { PwaInstallCard } from './pwa-install-card'
import {
  captureInstallPrompt,
  clearInstallPrompt,
  INSTALL_DISMISSED_KEY,
} from '@/lib/pwa-install'

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PwaInstallCard />
    </NextIntlClientProvider>,
  )
}
function available(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(
    new Event('beforeinstallprompt', { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    },
  )
  captureInstallPrompt(event)
  return { prompt, event }
}
describe('post-onboarding install card', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    clearInstallPrompt()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  it('hides unsupported browsers and never requests installation automatically', () => {
    renderCard()
    expect(
      screen.queryByRole('button', { name: 'Install' }),
    ).not.toBeInTheDocument()
  })
  it('captures an early event and installs only after a click', async () => {
    const { prompt, event } = available()
    renderCard()
    expect(event.defaultPrevented).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for installation',
    )
    fireEvent(window, new Event('appinstalled'))
    await waitFor(() =>
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument(),
    )
    expect(prompt).toHaveBeenCalledOnce()
  })
  it('persists dismissal for exactly seven days', () => {
    available()
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe(
      String(1000 + 7 * 86400000),
    )
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('does not show during dismissal period or when standalone', () => {
    available()
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now() + 10000))
    const view = renderCard()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    view.unmount()
    localStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    renderCard()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('shows iOS manual instructions without an unusable Install button', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    renderCard()
    expect(screen.getByText(/In Safari/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Install' }),
    ).not.toBeInTheDocument()
  })
  it('reports prompt failures without hiding the card', async () => {
    const { prompt } = available()
    prompt.mockRejectedValue(new Error('failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not complete',
    )
  })
})
