import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  clearBreadcrumbs: vi.fn(),
  getReplay: vi.fn(),
  addIntegration: vi.fn(),
  replayIntegration: vi.fn(),
  getClient: vi.fn(),
}))
const config = vi.hoisted(() => ({
  enabled: true,
  policyApproved: true,
  clarityEnabled: true,
  clarityProjectId: 'qa123',
  replayEnabled: true,
  dsn: 'test',
  environment: 'qa',
  release: 'test-release',
  deploymentKind: 'qa',
  replaySampleRate: 0.01,
  errorReplaySampleRate: 0.25,
}))
vi.mock('@sentry/nextjs', () => ({
  ...sdk,
  getCurrentScope: () => ({ clearBreadcrumbs: sdk.clearBreadcrumbs }),
}))
vi.mock('./config', () => ({ monitoringConfig: config }))

describe('authenticated recording lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    document.head.innerHTML = ''
    delete window.clarity
    vi.stubGlobal('location', {
      hostname: 'qa.example.test',
      origin: 'https://qa.example.test',
      reload: vi.fn(),
    })
    sdk.getReplay.mockReturnValue(undefined)
    sdk.getClient.mockReturnValue({ getOptions: () => ({}) })
    sdk.replayIntegration.mockReturnValue({})
  })

  afterEach(() => vi.unstubAllGlobals())

  it('never loads Clarity or replay on anonymous or auth pages', async () => {
    const browser = await import('./browser')
    browser.syncMonitoringPage('/')
    expect(document.querySelector('#microsoft-clarity')).toBeNull()
    browser.setMonitoringUser({ id: 'user-a' })
    browser.syncMonitoringPage('/login?email=private')
    await Promise.resolve()
    expect(document.querySelector('#microsoft-clarity')).toBeNull()
    expect(sdk.addIntegration).not.toHaveBeenCalled()
  })

  it('identifies the auth UUID, shared reference, page and approved PII only', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({
      id: 'user-a',
      email: 'approved@example.test',
      name: 'Approved',
    })
    browser.syncMonitoringPage('/cheques?search=private', {
      business_id: 'business-a',
      business_name: 'Never send',
      amount: 9000,
    })
    const clarity = vi.fn()
    window.clarity = clarity
    document
      .querySelector('#microsoft-clarity')
      ?.dispatchEvent(new Event('load'))
    expect(clarity).toHaveBeenCalledWith(
      'identify',
      'user-a',
      browser.getDiagnosticId(),
      '/cheques',
      'Approved',
    )
    expect(clarity).toHaveBeenCalledWith(
      'set',
      'email',
      'approved@example.test',
    )
    expect(JSON.stringify(clarity.mock.calls)).not.toMatch(
      /Never send|9000|search=private/,
    )
  })

  it('does not finish a queued start after opt-out', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'user-a' })
    browser.syncMonitoringPage('/')
    browser.setTrackingPreference(false)
    await vi.waitFor(() => expect(sdk.addIntegration).not.toHaveBeenCalled())
    expect(localStorage.getItem(browser.trackingPreferenceKey)).toBe('denied')
    expect(document.querySelector('#microsoft-clarity')).toBeNull()
    browser.syncMonitoringPage('/cheques')
    expect(document.querySelector('#microsoft-clarity')).toBeNull()
  })

  it('discards pending replay and clears identity before another user', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'user-a' })
    const first = browser.getDiagnosticId()
    const replay = { stop: vi.fn().mockResolvedValue(undefined) }
    sdk.getReplay.mockReturnValue(replay)
    browser.setMonitoringUser({ id: 'user-b' })
    expect(replay.stop).toHaveBeenCalledWith({ flush: false })
    expect(browser.getDiagnosticId()).not.toBe(first)
    expect(sdk.setUser).toHaveBeenCalledWith(null)
    expect(sdk.clearBreadcrumbs).toHaveBeenCalled()
    expect(sdk.setUser).toHaveBeenLastCalledWith({
      id: 'user-b',
      email: undefined,
      username: undefined,
    })
  })

  it('stops Clarity, clears its cookies and reloads on live opt-out', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'user-a' })
    browser.syncMonitoringPage('/')
    const clarity = vi.fn()
    window.clarity = clarity
    document
      .querySelector('#microsoft-clarity')
      ?.dispatchEvent(new Event('load'))
    document.cookie = '_clsk=old-session; Path=/'
    browser.setTrackingPreference(false)
    expect(clarity).toHaveBeenCalledWith('stop')
    expect(document.cookie).not.toContain('_clsk=old-session')
    expect(location.reload).toHaveBeenCalledOnce()
    browser.clarityEvent('payment.failure', true)
    expect(clarity).not.toHaveBeenCalledWith('event', 'payment.failure')
  })
})
