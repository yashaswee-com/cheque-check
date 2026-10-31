import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { MonitoringProvider } from './monitoring-provider'
import { MonitoringPreferences } from './monitoring-preferences'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../messages/en.json'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  setUser: vi.fn(),
  syncPage: vi.fn(),
  readPreference: vi.fn(() => true),
  setPreference: vi.fn(),
  profile: null as Record<string, unknown> | null,
  business: null as Record<string, unknown> | null,
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/cheques' }))
vi.mock('@/features/auth/services/auth.service', () => ({
  authService: { getUser: mocks.getUser, onAuthStateChange: mocks.subscribe },
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: mocks.business }),
}))
vi.mock('@/features/monetization/hooks/use-entitlements', () => ({
  useEntitlements: () => ({ data: [], dataUpdatedAt: 0 }),
}))
vi.mock('@/lib/monitoring/config', () => ({
  monitoringConfig: { enabled: true, policyApproved: true },
}))
vi.mock('@/lib/monitoring/browser', () => ({
  setMonitoringUser: mocks.setUser,
  syncMonitoringPage: mocks.syncPage,
  trackingPreferenceEvent: 'monitoring-change',
  trackingPreferenceKey: 'tracking',
  readTrackingPreference: mocks.readPreference,
  setTrackingPreference: mocks.setPreference,
}))

describe('MonitoringProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile = null
    mocks.business = null
    mocks.subscribe.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    })
  })
  afterEach(cleanup)

  it('identifies authenticated users even when profile loading fails', async () => {
    mocks.getUser.mockResolvedValue({
      id: 'auth-uuid',
      email: 'approved@example.test',
      user_metadata: {},
    })
    const view = render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith({
        id: 'auth-uuid',
        email: 'approved@example.test',
        name: undefined,
      }),
    )
    view.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores a stale initial lookup after a newer sign-out event', async () => {
    let resolve!: (user: User) => void
    mocks.getUser.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(<MonitoringProvider />)
    const callback = mocks.subscribe.mock.calls[0][0]
    act(() => callback('SIGNED_OUT', null))
    await act(async () =>
      resolve({ id: 'old-user', user_metadata: {} } as User),
    )
    expect(mocks.setUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'old-user' }),
    )
    expect(mocks.setUser).toHaveBeenLastCalledWith(null)
  })

  it('does not attach profile or business data belonging to the previous user', async () => {
    mocks.profile = {
      user_id: 'old-user',
      email: 'old@example.test',
      language: 'private',
    }
    mocks.business = { id: 'old-business', user_id: 'old-user' }
    mocks.getUser.mockResolvedValue({ id: 'new-user', user_metadata: {} })
    render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-user' }),
      ),
    )
    expect(JSON.stringify(mocks.syncPage.mock.calls)).not.toMatch(
      /old-business|private/,
    )
    expect(JSON.stringify(mocks.setUser.mock.calls)).not.toContain(
      'old@example.test',
    )
  })
})

describe('MonitoringPreferences', () => {
  afterEach(cleanup)

  it('shows the current browser preference and lets the user opt out', () => {
    const view = render(
      <NextIntlClientProvider
        locale="en"
        messages={{ Monitoring: messages.Monitoring }}
      >
        <MonitoringPreferences />
      </NextIntlClientProvider>,
    )
    const control = view.getByRole('switch', {
      name: messages.Monitoring.trackingLabel,
    })
    expect(control).toBeChecked()
    fireEvent.click(control)
    expect(mocks.setPreference).toHaveBeenCalledWith(false, expect.anything())
  })
})
