import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  monitoredFetch,
  monitorOperation,
  recordFeedbackSubmission,
  recordOperation,
} from './telemetry'

const mocks = vi.hoisted(() => ({
  config: { enabled: true },
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: vi.fn(async (_options: object, action: () => Promise<unknown>) =>
    action(),
  ),
  clarityEvent: vi.fn(),
  getDiagnosticId: vi.fn(() => 'diagnostic-id'),
  diagnosticHeaders: vi.fn(() => ({
    'x-diagnostic-session-id': 'diagnostic-id',
  })),
}))
vi.mock('@sentry/nextjs', () => mocks)
vi.mock('./config', () => ({ monitoringConfig: mocks.config }))
vi.mock('./browser', () => mocks)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.enabled = true
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('ok', { headers: { 'x-request-id': 'request-id' } }),
      ),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('operation telemetry', () => {
  it('records approved context only and marks failures as warnings', () => {
    recordOperation('cheque.create', 'failure', {
      business_id: 'b1',
      amount: 999,
      secret: 'private',
    })
    expect(mocks.addBreadcrumb).toHaveBeenCalledWith({
      category: 'app.operation',
      level: 'warning',
      data: {
        operation: 'cheque.create',
        outcome: 'failure',
        business_id: 'b1',
        diagnostic_session_id: 'diagnostic-id',
      },
    })
    expect(mocks.setTag).toHaveBeenCalledWith(
      'diagnostic_session_id',
      'diagnostic-id',
    )
    expect(mocks.clarityEvent).toHaveBeenCalledWith(
      'cheque.create.failure',
      true,
    )
  })

  it('returns the exact operation result and records elapsed success', async () => {
    const result = { id: 'c1' }
    await expect(
      monitorOperation('cheque.create', async () => result),
    ).resolves.toBe(result)
    expect(mocks.startSpan).toHaveBeenCalledWith(
      { name: 'cheque.create', op: 'app.operation', attributes: {} },
      expect.any(Function),
    )
    expect(
      mocks.addBreadcrumb.mock.calls.map(([value]) => value.data.outcome),
    ).toEqual(['started', 'success'])
    expect(mocks.addBreadcrumb.mock.calls[1][0].data.duration_ms).toEqual(
      expect.any(Number),
    )
  })

  it('records failures but rethrows the original error', async () => {
    const failure = new Error('operation failed')
    await expect(
      monitorOperation('cheque.create', async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(
      mocks.addBreadcrumb.mock.calls.map(([value]) => value.data.outcome),
    ).toEqual(['started', 'failure'])
  })

  it('does not instrument when monitoring is disabled', async () => {
    mocks.config.enabled = false
    recordOperation('cheque.create', 'started')
    recordFeedbackSubmission({ chequeId: 'c1' })
    await expect(
      monitorOperation('cheque.create', async () => 3),
    ).resolves.toBe(3)
    await monitoredFetch('/api/example')
    expect(mocks.addBreadcrumb).not.toHaveBeenCalled()
    expect(mocks.startSpan).not.toHaveBeenCalled()
    expect(mocks.captureMessage).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith('/api/example', undefined)
  })

  it('adds correlation headers only to same-origin API requests', async () => {
    await monitoredFetch('/api/payments?token=private', {
      method: 'POST',
      headers: { 'x-existing': 'kept' },
    })
    const call = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(call[1]?.headers)
    expect(headers.get('x-existing')).toBe('kept')
    expect(headers.get('x-diagnostic-session-id')).toBe('diagnostic-id')
    expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          route: '/api/payments',
          method: 'POST',
          status: 200,
          request_id: 'request-id',
        }),
      }),
    )
    expect(JSON.stringify(mocks.addBreadcrumb.mock.calls)).not.toContain(
      'private',
    )
  })

  it.each(['https://external.example/api/data', '/dashboard'])(
    'leaves headers untouched for %s',
    async (url) => {
      const init = { headers: { 'x-existing': 'kept' } }
      await monitoredFetch(url, init)
      expect(fetch).toHaveBeenCalledWith(url, init)
      expect(mocks.diagnosticHeaders).not.toHaveBeenCalled()
      expect(mocks.addBreadcrumb).not.toHaveBeenCalled()
    },
  )

  it('records unsuccessful API responses and successful feedback submissions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('failed', { status: 503 }),
    )
    await monitoredFetch('/api/example')
    expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning' }),
    )
    recordFeedbackSubmission({ business_id: 'b1', comment: 'private feedback' })
    expect(mocks.captureMessage).toHaveBeenCalledWith('feedback.submitted', {
      level: 'info',
      extra: { business_id: 'b1', diagnostic_session_id: 'diagnostic-id' },
    })
  })
})
