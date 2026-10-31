// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  getReplay: vi.fn(),
  getCurrentScope: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}))
const config = vi.hoisted(() => ({ enabled: true, policyApproved: true }))
vi.mock('@sentry/nextjs', () => sdk)
vi.mock('./config', () => ({ monitoringConfig: config }))

describe('server-safe browser telemetry entrypoints', () => {
  it('suppresses disabled identity updates and bounds only string metadata names', async () => {
    const { setRequestUser } = await import('./server')
    sdk.setUser.mockClear()
    try {
      config.enabled = false
      setRequestUser({ id: 'u1' })
      expect(sdk.setUser).not.toHaveBeenCalled()
      config.enabled = true
      setRequestUser({ id: 'u1', user_metadata: { name: 123 } })
      expect(sdk.setUser).toHaveBeenLastCalledWith({
        id: 'u1',
        email: undefined,
        username: undefined,
      })
      setRequestUser({ id: 'u1', user_metadata: { name: 'x'.repeat(200) } })
      expect(sdk.setUser).toHaveBeenLastCalledWith({
        id: 'u1',
        email: undefined,
        username: 'x'.repeat(160),
      })
    } finally {
      config.enabled = true
      sdk.setUser.mockClear()
    }
  })
  it('does not access browser globals or record browser identities during server rendering', async () => {
    const browser = await import('./browser')
    expect(browser.readTrackingPreference()).toBe(false)
    expect(browser.getDiagnosticId()).toBeUndefined()
    expect(browser.diagnosticHeaders()).toEqual({})
    browser.setMonitoringUser({ id: 'u1' })
    browser.syncMonitoringPage('/cheques')
    expect(sdk.setUser).not.toHaveBeenCalled()
    expect(sdk.setContext).not.toHaveBeenCalled()
  })

  it('records server operations without Clarity and does not leak browser headers to external hosts', async () => {
    const { recordOperation, monitoredFetch } = await import('./telemetry')
    recordOperation('cheque.create', 'success')
    expect(sdk.setTag).not.toHaveBeenCalled()
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { operation: 'cheque.create', outcome: 'success' },
      }),
    )
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'))
    try {
      await monitoredFetch('/api/example')
      expect(
        new Headers(fetch.mock.calls[0][1]?.headers).has(
          'x-diagnostic-session-id',
        ),
      ).toBe(false)
    } finally {
      fetch.mockRestore()
    }
  })
})
