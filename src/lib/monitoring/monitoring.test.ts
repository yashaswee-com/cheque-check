import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  safeContext,
  safeRoute,
  safeText,
  scrubBreadcrumb,
  scrubEvent,
} from './privacy'
import {
  getDiagnosticId,
  readTrackingPreference,
  setTrackingPreference,
  trackingPreferenceKey,
} from './browser'

describe('monitoring privacy', () => {
  it('never includes raw request data, arbitrary context or exception messages', () => {
    const event = scrubEvent({
      request: {
        url: 'https://app.test/api/ocr/cheque?token=secret',
        headers: { authorization: 'secret' },
        data: 'account_number=123456789',
      },
      user: {
        id: 'user-a',
        email: 'approved@example.com',
        username: 'Approved',
        ip_address: '1.2.3.4',
      },
      extra: {
        operation: 'ocr.extract',
        imageUrl: 'private',
        amount: 9000,
        payload: { secret: true },
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Payee Private Name account 123456789',
            stacktrace: {
              frames: [
                {
                  function: 'extract',
                  vars: { token: 'secret' },
                  context_line: 'secret',
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [{ category: 'console', message: 'secret' }],
    })
    const result = JSON.stringify(event)
    expect(result).not.toMatch(/secret|123456789|Private Name|9000|1\.2\.3\.4/)
    expect(event.user?.email).toBe('approved@example.com')
    expect(event.extra).toEqual({ operation: 'ocr.extract' })
  })

  it('removes queries, fragments, private storage paths and dynamic IDs', () => {
    expect(safeRoute('https://app.test/cheques/123?q=private#token')).toBe(
      '/cheques/[id]',
    )
    expect(
      safeRoute('/api/storage/cheques/customer/image.png?token=secret'),
    ).toBe('/api/storage/[private]')
    expect(safeRoute('/cheques/8f18d494-b278-43f1-b845-40706c779f72')).toBe(
      '/cheques/[id]',
    )
  })

  it('uses bounded scalar allowlists even for cyclic context', () => {
    const value: Record<string, unknown> = {
      operation: 'cheque.create',
      business_id: 'uuid',
      amount: 5,
      duration_ms: 12,
    }
    value.payload = value
    expect(safeContext(value)).toEqual({
      operation: 'cheque.create',
      business_id: 'uuid',
      duration_ms: 12,
    })
    expect(
      scrubBreadcrumb({ category: 'ui.click', message: 'Private Name' }),
    ).toBeNull()
    expect(
      safeText(
        'Failed for person@example.com at https://private.test/?token=key account 123456',
      ),
    ).not.toMatch(/person@|private.test|123456/)
  })
})

describe('browser monitoring policy', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('never enables analytics without an approved default or browser preference', () => {
    expect(readTrackingPreference()).toBe(false)
    setTrackingPreference(false)
    expect(localStorage.getItem(trackingPreferenceKey)).toBe('denied')
    expect(readTrackingPreference()).toBe(false)
  })

  it('gives browser privacy signals priority over an allowed preference', () => {
    localStorage.setItem(trackingPreferenceKey, 'allowed')
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    expect(readTrackingPreference()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('maintains a bounded diagnostic reference without storing email or tokens', () => {
    const first = getDiagnosticId()
    expect(first).toMatch(/^[a-f0-9-]{36}$/)
    expect(getDiagnosticId()).toBe(first)
    expect(sessionStorage.getItem('cheque-check:diagnostics:v1')).not.toMatch(
      /email|token/i,
    )
  })
})
