import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaPixelConsent } from './meta-pixel-consent'
import { CONSENT_KEY } from '@/features/analytics/contracts'

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
  manageLabel: 'Cookie settings',
  saveError: 'Could not save your choice.',
}
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
  it('requires fresh consent for the expanded scope', async () => {
    localStorage.setItem('cheque-check:meta-marketing-consent:v1', 'accepted')
    render(<MetaPixelConsent {...props} />)
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
    render(<MetaPixelConsent {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(localStorage.getItem(CONSENT_KEY)).toBe('rejected')
    expect(mocks.clear).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    expect(screen.getByRole('region')).toBeVisible()
  })
  it('retains the dialog and reports server synchronization failures', async () => {
    mocks.sync.mockResolvedValue(false)
    render(<MetaPixelConsent {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(props.saveError)
  })
  it('still attempts server withdrawal when local storage is unavailable', async () => {
    render(<MetaPixelConsent {...props} />)
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
    render(<MetaPixelConsent {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(localStorage.getItem(CONSENT_KEY)).toBe('rejected'),
    )
  })
})
