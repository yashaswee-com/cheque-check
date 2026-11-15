import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_KEY,
  OPEN_PREFERENCES_EVENT,
} from '../contracts'
import { CookiePreferences } from './cookie-preferences'
import { CookieSettingsButton } from '@/components/public-site/cookie-settings-button'
import { readConsent } from '../consent-store'

const renderPrefs = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CookiePreferences />
    </NextIntlClientProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'true')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'doNotTrack')
})

describe('CookiePreferences', () => {
  it('shows the current choice and reopens the cookie banner', () => {
    const open = vi.fn()
    window.addEventListener(OPEN_PREFERENCES_EVENT, open)
    renderPrefs()
    expect(screen.getByRole('status')).toHaveTextContent(
      'You have not made a choice yet',
    )
    act(() => {
      localStorage.setItem(CONSENT_KEY, 'accepted')
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Optional marketing cookies are allowed',
    )
    act(() => {
      localStorage.setItem(CONSENT_KEY, 'rejected')
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Optional marketing cookies are off',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage cookie settings' }),
    )
    expect(open).toHaveBeenCalledOnce()
    window.removeEventListener(OPEN_PREFERENCES_EVENT, open)
  })

  it('treats browser opt-out signals as rejected', () => {
    Object.defineProperty(navigator, 'doNotTrack', {
      value: '1',
      configurable: true,
    })
    localStorage.setItem(CONSENT_KEY, 'accepted')
    renderPrefs()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Optional marketing cookies are off',
    )
  })

  it('explains when marketing cookies are unavailable', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'false')
    renderPrefs()
    expect(screen.getByRole('status')).toHaveTextContent(
      'disabled for this deployment',
    )
    expect(
      screen.getByRole('button', { name: 'Manage cookie settings' }),
    ).toBeDisabled()
  })

  it('reads consent defensively when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readConsent()).toBeNull()
  })
})

describe('CookieSettingsButton', () => {
  it('opens cookie settings from the public footer only when enabled', () => {
    const open = vi.fn()
    window.addEventListener(OPEN_PREFERENCES_EVENT, open)
    const { rerender } = render(
      <CookieSettingsButton label="Cookie settings" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    expect(open).toHaveBeenCalledOnce()
    vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'false')
    rerender(<CookieSettingsButton label="Cookie settings" />)
    expect(screen.queryByRole('button')).toBeNull()
    window.removeEventListener(OPEN_PREFERENCES_EVENT, open)
  })
})
