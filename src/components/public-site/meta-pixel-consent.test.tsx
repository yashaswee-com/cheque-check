import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTrackablePublicRoute, MetaPixelConsent } from './meta-pixel-consent'

const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

const props = {
  title: 'Optional marketing cookies',
  description: 'Page visits on this public website only.',
  acceptLabel: 'Accept',
  rejectLabel: 'Reject',
  manageLabel: 'Cookie settings',
  saveError: 'Could not save your choice.',
}

beforeEach(() => {
  route.pathname = '/'
  localStorage.clear()
  history.replaceState(null, '', '/')
  delete window.fbq
  delete window._fbq
  document.head.innerHTML = ''
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Meta Pixel consent', () => {
  it('only treats explicitly approved public pages as trackable', () => {
    expect(isTrackablePublicRoute('/')).toBe(true)
    expect(isTrackablePublicRoute('/pricing')).toBe(true)
    expect(isTrackablePublicRoute('/dashboard')).toBe(false)
    expect(isTrackablePublicRoute('/sentry-example-page')).toBe(false)
    expect(isTrackablePublicRoute('/pricing/123')).toBe(false)
  })

  it('does not load the pixel before consent and starts pageview tracking after opt-in', async () => {
    render(<MetaPixelConsent {...props} />)

    expect(
      await screen.findByRole('region', { name: props.title }),
    ).toBeVisible()
    expect(document.querySelector('#meta-pixel-script')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: props.acceptLabel }))

    await waitFor(() =>
      expect(document.querySelector('#meta-pixel-script')).toHaveAttribute(
        'src',
        'https://connect.facebook.net/en_US/fbevents.js',
      ),
    )
    expect(window.fbq?.queue).toEqual([
      ['set', 'autoConfig', false, '1782530103005623'],
      ['init', '1782530103005623'],
      ['consent', 'grant'],
      ['track', 'PageView'],
    ])
    expect(screen.queryByRole('region', { name: props.title })).toBeNull()
  })

  it('keeps the pixel off after rejection and allows the choice to be reopened', async () => {
    render(<MetaPixelConsent {...props} />)

    fireEvent.click(
      await screen.findByRole('button', { name: props.rejectLabel }),
    )
    expect(localStorage.getItem('cheque-check:meta-marketing-consent:v1')).toBe(
      'rejected',
    )
    expect(document.querySelector('#meta-pixel-script')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: props.manageLabel }))
    expect(screen.getByRole('region', { name: props.title })).toBeVisible()
  })

  it('does not load or send pageviews for paths with query or fragment data', async () => {
    route.pathname = '/pricing'
    history.replaceState(null, '', '/pricing?ref=private#section')
    render(<MetaPixelConsent {...props} />)

    fireEvent.click(
      await screen.findByRole('button', { name: props.acceptLabel }),
    )

    expect(document.querySelector('#meta-pixel-script')).toBeNull()
    expect(window.fbq).toBeUndefined()
  })
})
