import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import { PwaInstallCard } from './pwa-install-card'
import {
  captureInstallPrompt,
  clearInstallPrompt,
  INSTALL_DISMISSED_KEY,
} from '@/lib/pwa-install'

function renderCard(onResolved?: (resolved: boolean) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PwaInstallCard onResolved={onResolved} />
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
    sessionStorage.clear()
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(prompt).toHaveBeenCalledOnce()
  })
  it('suppresses dismissal for the current browser session', () => {
    available()
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(sessionStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('true')
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    renderCard()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('does not show during the dismissed session or when standalone', () => {
    available()
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
    const view = renderCard()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    sessionStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    renderCard()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows iOS manual instructions without an unusable Install button', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    renderCard()
    expect(screen.getByText(/In Safari/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
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
  it('traps focus and treats Escape as a session-only dismissal', async () => {
    const onResolved = vi.fn()
    available()
    renderCard(onResolved)
    const dialog = screen.getByRole('dialog', { name: messages.PWA.title })
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )

    await userEvent.setup().keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sessionStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('true')
    expect(onResolved).toHaveBeenLastCalledWith(true)
  })
})
