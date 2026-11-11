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
import messages from '../../messages/en.json'
import { PwaInstallCard } from './pwa-install-card'
import { PwaRegistrar } from './pwa-registrar'
import {
  captureInstallPrompt,
  clearInstallPrompt,
  INSTALL_DISMISSED_KEY,
} from '@/lib/pwa-install'

function renderCard(
  onResolved?: (resolved: boolean) => void,
  variant: 'modal' | 'inline' = 'modal',
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PwaInstallCard onResolved={onResolved} variant={variant} />
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

  it('renders an inline Settings card despite automatic modal dismissal', async () => {
    const { prompt } = available()
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
    renderCard(undefined, 'inline')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('region', { name: messages.PWA.title }),
    ).toBeVisible()
    expect(prompt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      messages.PWA.inlineWaiting,
    )
    fireEvent(window, new Event('appinstalled'))
    expect(screen.queryByRole('region')).toBeNull()
    cleanup()
    renderCard(undefined, 'inline')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('keeps the inline card after declining and accepts a newly offered prompt', async () => {
    available('dismissed')
    renderCard(undefined, 'inline')
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByText(messages.PWA.declined)).toBeVisible()
    expect(screen.getByRole('region')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    expect(sessionStorage.getItem(INSTALL_DISMISSED_KEY)).toBeNull()
    let offered!: ReturnType<typeof available>
    act(() => {
      offered = available()
    })
    expect(screen.getByRole('button', { name: 'Install' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await waitFor(() => expect(offered.prompt).toHaveBeenCalledOnce())
  })

  it('shows unavailable guidance without an unusable button', () => {
    renderCard(undefined, 'inline')
    expect(screen.getByText(messages.PWA.browserInstructions)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.PWA.unavailable,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([
    ['iPhone', messages.PWA.iosInstructions],
    ['Mozilla/5.0 (Linux; Android 14)', messages.PWA.androidInstructions],
    [
      'Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15',
      messages.PWA.macSafariInstructions,
    ],
    [
      'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36',
      messages.PWA.browserInstructions,
    ],
  ])('provides platform-specific manual guidance: %s', (agent, guidance) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
    renderCard(undefined, 'inline')
    expect(screen.getByText(guidance)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('hides the inline card in standalone mode', () => {
    available()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    renderCard(undefined, 'inline')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('reacts when the display mode changes to standalone', () => {
    let changed!: () => void
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, callback: () => void) => {
        changed = callback
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', () => media)
    const view = renderCard(undefined, 'inline')
    expect(screen.getByRole('region')).toBeVisible()
    act(() => {
      media.matches = true
      changed()
    })
    expect(screen.queryByRole('region')).toBeNull()
    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', changed)
  })

  it('remembers installation confirmed by the registrar while the card is unmounted', () => {
    const registrar = render(<PwaRegistrar />)
    fireEvent(window, new Event('appinstalled'))
    registrar.unmount()
    renderCard(undefined, 'inline')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('supports explicit keyboard installation without opening a dialog', async () => {
    const { prompt } = available()
    renderCard(undefined, 'inline')
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('allows retrying a failed inline install and guards duplicate clicks', async () => {
    const { prompt } = available()
    prompt.mockRejectedValueOnce(new Error('failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderCard(undefined, 'inline')
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.PWA.error,
    )
    const button = screen.getByRole('button', { name: 'Install' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        messages.PWA.inlineWaiting,
      ),
    )
    expect(prompt).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
