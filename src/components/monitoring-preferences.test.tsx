import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonitoringPreferences } from './monitoring-preferences'

const state = vi.hoisted(() => ({
  config: { enabled: true, policyApproved: true },
  allowed: true,
  setTrackingPreference: vi.fn(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/monitoring/config', () => ({ monitoringConfig: state.config }))
vi.mock('@/lib/monitoring/browser', () => ({
  readTrackingPreference: () => state.allowed,
  setTrackingPreference: state.setTrackingPreference,
  trackingPreferenceEvent: 'tracking-change',
  trackingPreferenceKey: 'tracking-key',
}))
beforeEach(() => {
  vi.clearAllMocks()
  state.allowed = true
  state.config.enabled = state.config.policyApproved = true
})
afterEach(cleanup)

describe('MonitoringPreferences', () => {
  it('reads the preference and lets users withdraw consent', () => {
    render(<MonitoringPreferences />)
    expect(screen.getByRole('switch')).toBeChecked()
    fireEvent.click(screen.getByRole('switch'))
    expect(state.setTrackingPreference).toHaveBeenCalledWith(
      false,
      expect.anything(),
    )
  })

  it('shows tracking details on demand instead of inline', async () => {
    render(<MonitoringPreferences />)
    expect(screen.getByText('trackingLabel')).toHaveAttribute(
      'data-slot',
      'setting-switch-label',
    )
    expect(screen.queryByText('trackingDescription')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button'))
    expect(await screen.findByText('trackingDescription')).toBeVisible()
  })

  it('synchronizes local events and relevant cross-tab storage changes', () => {
    render(<MonitoringPreferences />)
    state.allowed = false
    fireEvent(window, new Event('tracking-change'))
    expect(screen.getByRole('switch')).not.toBeChecked()
    state.allowed = true
    fireEvent(window, new StorageEvent('storage', { key: 'other-key' }))
    expect(screen.getByRole('switch')).not.toBeChecked()
    fireEvent(window, new StorageEvent('storage', { key: 'tracking-key' }))
    expect(screen.getByRole('switch')).toBeChecked()
    state.allowed = false
    fireEvent(window, new StorageEvent('storage', { key: null }))
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it.each(['enabled', 'policyApproved'] as const)(
    'disables tracking without %s',
    (key) => {
      state.config[key] = false
      render(<MonitoringPreferences />)
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      expect(screen.getByRole('switch')).not.toBeChecked()
      expect(screen.getByText('unavailable')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('switch'))
      expect(state.setTrackingPreference).not.toHaveBeenCalled()
    },
  )
})
