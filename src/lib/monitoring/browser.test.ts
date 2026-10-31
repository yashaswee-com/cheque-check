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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('respects privacy signals and unavailable preference storage', async () => {
    const browser = await import('./browser')
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    expect(browser.readTrackingPreference()).toBe(false)
    vi.stubGlobal('navigator', { doNotTrack: '0' })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(browser.readTrackingPreference()).toBe(false)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    browser.setTrackingPreference(true)
    expect(browser.trackingAllowed()).toBe(false)
  })

  it('reuses valid diagnostic sessions and rotates idle sessions', async () => {
    const id = '12345678-1234-1234-1234-123456789abc'
    sessionStorage.setItem(
      'cheque-check:diagnostics:v1',
      JSON.stringify({ id, owner: null, time: Date.now() }),
    )
    const browser = await import('./browser')
    expect(browser.getDiagnosticId()).toBe(id)
    expect(browser.diagnosticHeaders()).toEqual({
      'x-diagnostic-session-id': id,
    })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000)
    expect(browser.getDiagnosticId()).not.toBe(id)
    expect(sdk.setTag).toHaveBeenCalledWith(
      'diagnostic_session_id',
      expect.any(String),
    )
  })

  it('creates a diagnostic session despite malformed or blocked session storage', async () => {
    sessionStorage.setItem('cheque-check:diagnostics:v1', '{broken')
    const browser = await import('./browser')
    expect(browser.getDiagnosticId()).toMatch(/^[a-f0-9-]{36}$/)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    browser.setMonitoringUser({ id: 'a' })
    browser.setMonitoringUser({ id: 'b' })
    expect(browser.getDiagnosticId()).toMatch(/^[a-f0-9-]{36}$/)
  })

  it.each([
    { random: 0, method: 'start' },
    { random: 0.9, method: 'startBuffering' },
  ] as const)(
    'starts existing replay with $method',
    async ({ random, method }) => {
      const browser = await import('./browser')
      browser.setMonitoringUser({ id: 'a' })
      const replay = {
        getReplayId: vi.fn().mockReturnValue(undefined),
        start: vi.fn(),
        startBuffering: vi.fn(),
      }
      sdk.getReplay.mockReturnValue(replay)
      vi.spyOn(Math, 'random').mockReturnValue(random)
      browser.syncMonitoringPage('/cheques')
      await vi.waitFor(() => expect(replay[method]).toHaveBeenCalledOnce())
      expect(sdk.addIntegration).not.toHaveBeenCalled()
    },
  )

  it('filters replay events and error sampling at the integration boundary', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'a' })
    browser.syncMonitoringPage('/cheques')
    await vi.waitFor(() => expect(sdk.addIntegration).toHaveBeenCalledOnce())
    const options = sdk.replayIntegration.mock.calls[0][0]
    expect(options.beforeErrorSampling({ level: 'info' })).toBe(false)
    expect(options.beforeErrorSampling({ level: 'error' })).toBe(true)
    expect(options.beforeAddRecordingEvent({ type: 5 })).toBeNull()
    expect(options.beforeAddRecordingEvent({ type: 2 })).toEqual({ type: 2 })
    browser.setTrackingPreference(false)
    expect(options.beforeAddRecordingEvent({ type: 2 })).toBeNull()
  })

  it('does not add replay without a Sentry client', async () => {
    sdk.getClient.mockReturnValue(undefined)
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'a' })
    browser.syncMonitoringPage('/cheques')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sdk.addIntegration).not.toHaveBeenCalled()
  })

  it('queues consent, emits loaded events, and upgrades critical sessions', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'a' })
    browser.syncMonitoringPage('/cheques')
    expect(window.clarity?.q).toContainEqual([
      'consentv2',
      { analytics_Storage: 'granted', ad_Storage: 'denied' },
    ])
    const clarity = vi.fn()
    window.clarity = clarity
    document
      .querySelector('#microsoft-clarity')
      ?.dispatchEvent(new Event('load'))
    browser.clarityEvent('saved')
    browser.clarityEvent('failed', true)
    expect(clarity).toHaveBeenCalledWith('event', 'saved')
    expect(clarity).toHaveBeenCalledWith('upgrade', 'failed')
    clarity.mockImplementation(() => {
      throw new Error('sdk failed')
    })
    expect(() => browser.clarityEvent('failed', true)).not.toThrow()
    await browser.stopRecordings()
  })

  it('removes a failed script and rejects a late script load after auth changes', async () => {
    const browser = await import('./browser')
    browser.setMonitoringUser({ id: 'a' })
    browser.syncMonitoringPage('/cheques')
    document
      .querySelector('#microsoft-clarity')
      ?.dispatchEvent(new Event('error'))
    expect(document.querySelector('#microsoft-clarity')).toBeNull()
    await browser.stopRecordings()
    browser.syncMonitoringPage('/cheques')
    const script = document.querySelector('#microsoft-clarity')!
    browser.syncMonitoringPage('/login')
    script.dispatchEvent(new Event('load'))
    expect(location.reload).toHaveBeenCalled()
  })

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
