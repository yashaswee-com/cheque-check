import { describe, expect, it } from 'vitest'
import {
  isExpectedError,
  safeContext,
  safeRoute,
  scrubBreadcrumb,
  scrubEvent,
} from './privacy'

describe('telemetry privacy edge cases', () => {
  it('rejects invalid absolute URLs and nonfinite context values', () => {
    expect(safeRoute('http://[')).toBe('[invalid-url]')
    expect(safeContext(null)).toEqual({})
    expect(
      safeContext({
        status: NaN,
        duration_ms: Infinity,
        outcome: true,
        route: '/cheques/123?secret=x',
      }),
    ).toEqual({ outcome: true, route: '/cheques/[id]' })
  })

  it('recognizes only explicitly expected Error types', () => {
    expect(isExpectedError({ name: 'ValidationError' })).toBe(false)
    expect(isExpectedError(new Error())).toBe(false)
    expect(
      isExpectedError(Object.assign(new Error(), { name: 'AbortError' })),
    ).toBe(true)
  })

  it('preserves only safe breadcrumb context', () => {
    expect(
      scrubBreadcrumb({
        category: 'app.operation',
        message: 'private',
        data: { operation: 'save', payload: 'private' },
      }),
    ).toEqual({
      category: 'app.operation',
      message: undefined,
      data: { operation: 'save' },
    })
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/cheques/12', to: '/parties/13' },
      })?.data,
    ).toEqual({ from: '/cheques/[id]', to: '/parties/[id]' })
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/api/example?token=x', method: 'POST', status_code: 503 },
      })?.data,
    ).toEqual({ url: '/api/example', method: 'POST', status_code: 503 })
  })

  it('scrubs context, span descriptions and query-bearing stack paths', () => {
    const event = scrubEvent({
      transaction: '/cheques/123?q=x',
      contexts: {
        trace: {
          trace_id: 'trace',
          span_id: 'span',
          data: { operation: 'save', amount: 300 },
        },
        app: { business_id: 'b1', name: 'private' },
        replay: { replay_id: 'replay', secret: 'private' },
        browser: { name: 'Browser', version: '1', secret: 'private' },
        os: { name: 'OS', version: '2', secret: 'private' },
      },
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: 'app.js?token=x',
                  abs_path: 'https://app.example/app.js#private',
                },
              ],
            },
          },
        ],
      },
      spans: [
        {
          span_id: 'span',
          trace_id: 'trace',
          start_timestamp: 1,
          timestamp: 2,
          op: 'save',
          description: 'private',
          data: { amount: 300, operation: 'save' },
        },
      ],
    })
    expect(event.transaction).toBe('/cheques/[id]')
    expect(event.contexts?.trace?.data).toEqual({ operation: 'save' })
    expect(event.contexts?.app).toEqual({ business_id: 'b1' })
    expect(event.contexts?.replay).toEqual({ replay_id: 'replay' })
    expect(event.contexts?.browser).toEqual({ name: 'Browser', version: '1' })
    expect(event.contexts?.os).toEqual({ name: 'OS', version: '2' })
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0].filename).toBe(
      'app.js',
    )
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0].abs_path).toBe(
      'https://app.example/app.js',
    )
    expect(event.spans?.[0].description).toBe('save')
    expect(event.spans?.[0].data).toEqual({ operation: 'save' })
  })
})
