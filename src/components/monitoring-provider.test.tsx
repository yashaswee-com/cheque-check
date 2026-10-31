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
import type { Entitlement } from '@/features/monetization/repositories/monetization.repository'
import { FEATURE_IDS } from '@/features/monetization/constants'

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
  enabled: true,
  entitlements: [] as Entitlement[] | undefined,
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
  useEntitlements: () => ({ data: mocks.entitlements, dataUpdatedAt: 0 }),
}))
vi.mock('@/lib/monitoring/config', () => ({
  monitoringConfig: {
    get enabled() {
      return mocks.enabled
    },
    policyApproved: true,
  },
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
    mocks.enabled = true
    mocks.entitlements = []
    mocks.subscribe.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    })
  })
  afterEach(cleanup)

  it('attaches only the authenticated users matching premium entitlement', async () => {
    mocks.entitlements = [
      {
        id: 'ent1',
        user_id: 'u1',
        feature_id: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'active',
        valid_until: null,
      },
    ]
    mocks.getUser.mockResolvedValue({ id: 'u1', user_metadata: {} })
    render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.syncPage).toHaveBeenCalledWith(
        '/cheques',
        expect.objectContaining({
          entitlement: 'active',
          tier: 'premium',
        }),
      ),
    )
  })

  it('does not subscribe when monitoring is disabled', () => {
    mocks.enabled = false
    const { container } = render(<MonitoringProvider />)
    expect(container).toBeEmptyDOMElement()
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('handles failed initial identity and avoids late identity updates after unmount', async () => {
    mocks.getUser.mockRejectedValueOnce(new Error('offline'))
    const { unmount } = render(<MonitoringProvider />)
    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(null))
    unmount()
    mocks.setUser.mockClear()
    const callback = mocks.subscribe.mock.calls[0][0]
    act(() =>
      callback('SIGNED_IN', { user: { id: 'late', user_metadata: {} } }),
    )
    expect(mocks.setUser).not.toHaveBeenCalled()
  })

  it('synchronizes preference changes without unrelated storage events', async () => {
    mocks.getUser.mockResolvedValue({
      id: 'u1',
      user_metadata: { name: 'Asha' },
    })
    render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Asha' }),
      ),
    )
    mocks.syncPage.mockClear()
    fireEvent(window, new StorageEvent('storage', { key: 'other' }))
    expect(mocks.syncPage).not.toHaveBeenCalled()
    fireEvent(window, new StorageEvent('storage', { key: 'tracking' }))
    fireEvent(window, new StorageEvent('storage', { key: null }))
    fireEvent(window, new Event('monitoring-change'))
    expect(mocks.syncPage).toHaveBeenCalledTimes(3)
  })

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

  it('uses matching profile preferences and a trial entitlement instead of stale or unrelated entitlements', async () => {
    mocks.profile = {
      user_id: 'u1',
      email: 'profile@example.test',
      name: 'Profile Name',
      language: 'hi',
      time_zone: 'Asia/Kolkata',
      currency: 'INR',
    }
    mocks.business = { id: 'b1', user_id: 'u1' }
    mocks.entitlements = [
      {
        id: 'old',
        user_id: 'old-user',
        feature_id: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'active',
        valid_until: null,
      },
      {
        id: 'other',
        user_id: 'u1',
        feature_id: FEATURE_IDS.AI_SCANNER_SUB,
        status: 'active',
        valid_until: null,
      },
      {
        id: 'trial',
        user_id: 'u1',
        feature_id: FEATURE_IDS.LIFETIME_PREMIUM,
        status: 'trialing',
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]
    mocks.getUser.mockResolvedValue({
      id: 'u1',
      email: 'auth@example.test',
      user_metadata: { name: 'Auth Name' },
    })
    render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenLastCalledWith({
        id: 'u1',
        email: 'profile@example.test',
        name: 'Profile Name',
      }),
    )
    expect(mocks.syncPage).toHaveBeenLastCalledWith('/cheques', {
      business_id: 'b1',
      language: 'hi',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      entitlement: 'trialing',
      tier: 'premium',
    })
  })

  it('falls back to authenticated metadata while entitlement and profile fields are unavailable', async () => {
    mocks.profile = { user_id: 'u1', email: null, name: null }
    mocks.entitlements = undefined
    mocks.getUser.mockResolvedValue({
      id: 'u1',
      email: 'auth@example.test',
      user_metadata: { name: 123 },
    })
    render(<MonitoringProvider />)
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith({
        id: 'u1',
        email: 'auth@example.test',
        name: undefined,
      }),
    )
    expect(mocks.syncPage).toHaveBeenLastCalledWith(
      '/cheques',
      expect.objectContaining({
        entitlement: 'unknown',
        tier: 'unknown',
      }),
    )
  })

  it('does not overwrite a newer sign-in when the initial identity lookup fails', async () => {
    let rejectLookup!: (reason: Error) => void
    mocks.getUser.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLookup = reject
      }),
    )
    render(<MonitoringProvider />)
    act(() =>
      mocks.subscribe.mock.calls[0][0]('SIGNED_IN', {
        user: { id: 'new-user', user_metadata: {} },
      }),
    )
    mocks.setUser.mockClear()
    await act(async () => rejectLookup(new Error('stale lookup')))
    expect(mocks.setUser).not.toHaveBeenCalledWith(null)
  })
})

describe('MonitoringPreferences', () => {
  afterEach(cleanup)

  it('explains why tracking is unavailable when monitoring is disabled', () => {
    mocks.enabled = false
    try {
      const view = render(
        <NextIntlClientProvider
          locale="en"
          messages={{ Monitoring: messages.Monitoring }}
        >
          <MonitoringPreferences />
        </NextIntlClientProvider>,
      )
      expect(view.getByRole('switch')).toHaveAttribute('aria-disabled', 'true')
      expect(
        view.getByText(messages.Monitoring.unavailable),
      ).toBeInTheDocument()
    } finally {
      mocks.enabled = true
    }
  })

  it('refreshes browser preference only for relevant storage and preference events', () => {
    mocks.readPreference.mockReturnValue(true)
    const view = render(
      <NextIntlClientProvider
        locale="en"
        messages={{ Monitoring: messages.Monitoring }}
      >
        <MonitoringPreferences />
      </NextIntlClientProvider>,
    )
    const control = view.getByRole('switch')
    mocks.readPreference.mockReturnValue(false)
    fireEvent(window, new StorageEvent('storage', { key: 'other' }))
    expect(control).toBeChecked()
    fireEvent(window, new StorageEvent('storage', { key: 'tracking' }))
    expect(control).not.toBeChecked()
    mocks.readPreference.mockReturnValue(true)
    fireEvent(window, new StorageEvent('storage', { key: null }))
    expect(control).toBeChecked()
    mocks.readPreference.mockReturnValue(false)
    fireEvent(window, new Event('monitoring-change'))
    expect(control).not.toBeChecked()
    mocks.readPreference.mockReturnValue(true)
  })

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
