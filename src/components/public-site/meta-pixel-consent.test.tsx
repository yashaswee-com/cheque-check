import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { MetaPixelConsent } from './meta-pixel-consent'
import { CONSENT_KEY } from '@/features/analytics/contracts'
import { openCookieSettings } from '@/features/analytics/consent-store'

const mocks = vi.hoisted(() => ({ sync: vi.fn(), clear: vi.fn() }))
vi.mock('@/features/analytics/browser', () => ({
  syncMarketing: mocks.sync,
  clearMarketingStorage: mocks.clear,
}))
const props = {
  title: 'Optional marketing cookies',
  description: 'Marketing events and matching identifiers.',
  acceptLabel: 'Accept',
  rejectLabel: 'Reject',
  saveError: 'Could not save your choice.',
  settingsLabel: 'Cookie settings',
  settingsDescription: 'Choose which optional cookies are allowed.',
  essentialTitle: 'Essential storage',
  essentialDescription: 'Used for sign-in and core app features.',
  alwaysActive: 'Always active',
  marketingTitle: 'Marketing and analytics',
  marketingDescription: 'Measure selected visits and product milestones.',
  showDetails: 'Show details',
  hideDetails: 'Hide details',
  marketingDetails: 'Selected visits may be shared with Meta.',
  aboutLabel: 'About',
  aboutTitle: 'About cookies and your choice',
  aboutDescription: 'Essential storage supports core service functionality.',
  privacyLink: 'Read our privacy policy',
  rejectOptional: 'Reject optional',
  savePreferences: 'Save preferences',
}
const renderConsent = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MetaPixelConsent {...props} />
    </NextIntlClientProvider>,
  )
beforeEach(() => {
  localStorage.clear()
  mocks.sync.mockReset().mockResolvedValue(true)
  mocks.clear.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'doNotTrack')
})

describe('marketing consent', () => {
  it('renders the banner in the initial HTML without waiting for hydration', () => {
    const markup = renderToString(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MetaPixelConsent {...props} />
      </NextIntlClientProvider>,
    )
    expect(markup).toContain('aria-label="Optional marketing cookies"')
  })

  it('requires fresh consent for the expanded scope', async () => {
    localStorage.setItem('cheque-check:meta-marketing-consent:v1', 'accepted')
    renderConsent()
    expect(
      await screen.findByRole('region', { name: props.title }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(mocks.sync).toHaveBeenCalledWith('sync', { explicitChoice: true }),
    )
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted')
    expect(
      localStorage.getItem('cheque-check:meta-marketing-consent:v1'),
    ).toBeNull()
  })
  it('withdraws consent, clears identifiers, and can reopen preferences', async () => {
    renderConsent()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(localStorage.getItem(CONSENT_KEY)).toBe('rejected')
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Cookie settings' })).toBeNull()
    act(() => openCookieSettings())
    expect(
      await screen.findByRole('dialog', { name: 'Cookie settings' }),
    ).toBeVisible()
  })
  it('saves the selected marketing preference from the settings panel', async () => {
    renderConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Cookie settings',
    })
    const marketing = screen.getByRole('switch', {
      name: 'Marketing and analytics',
    })
    expect(marketing).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(marketing)
    expect(marketing).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() =>
      expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted'),
    )
    await waitFor(() => expect(dialog).not.toBeVisible())
    expect(mocks.sync).toHaveBeenCalledWith('sync', { explicitChoice: true })
  })
  it('shows the about panel and expands marketing details', async () => {
    renderConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    await screen.findByRole('dialog', { name: 'Cookie settings' })
    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(screen.getByRole('region', { name: 'About' })).toHaveTextContent(
      props.aboutDescription,
    )
    expect(
      screen.getByRole('link', { name: 'Read our privacy policy' }),
    ).toHaveAttribute('href', '/privacy')
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText(props.marketingDetails)).toBeVisible()
  })
  it('retains the dialog and reports server synchronization failures', async () => {
    mocks.sync.mockResolvedValue(false)
    renderConsent()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(props.saveError)
  })
  it('still attempts server withdrawal when local storage is unavailable', async () => {
    renderConsent()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() =>
      expect(mocks.sync).toHaveBeenCalledWith('sync', {
        explicitChoice: true,
        acceptedOverride: false,
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(props.saveError)
  })
  it('honors DNT instead of granting marketing consent', async () => {
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: '1',
    })
    renderConsent()
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(localStorage.getItem(CONSENT_KEY)).toBe('rejected'),
    )
  })
})
