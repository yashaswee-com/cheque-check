import * as Sentry from '@sentry/nextjs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { setRequestUser, withMonitoringRequest } from './server'
import { logger } from '@/lib/logger'

vi.mock('./config', () => ({ monitoringConfig: { enabled: true } }))
const output = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('./browser', () => ({ getDiagnosticId: () => undefined }))
vi.mock('pino', () => ({ default: () => ({ info: output.info }) }))

describe('request monitoring isolation', () => {
  beforeAll(() => {
    Sentry.init({ enabled: false, defaultIntegrations: false })
  })

  it('keeps concurrent authenticated requests separate', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = withMonitoringRequest(
      new Request('https://app.test/api/ocr/cheque'),
      'ocr.extract',
      async () => {
        setRequestUser({ id: 'user-a' })
        await gate
        expect(Sentry.getIsolationScope().getUser()?.id).toBe('user-a')
        return new Response('a')
      },
    )
    const second = withMonitoringRequest(
      new Request('https://app.test/api/payments/create-order'),
      'payment.create_order',
      async () => {
        setRequestUser({ id: 'user-b' })
        expect(Sentry.getIsolationScope().getUser()?.id).toBe('user-b')
        release()
        return new Response('b')
      },
    )
    const responses = await Promise.all([first, second])
    expect(responses[0].headers.get('x-request-id')).not.toBe(
      responses[1].headers.get('x-request-id'),
    )
  })

  it('does not trust supplied identity or invalid diagnostic headers', async () => {
    await withMonitoringRequest(
      new Request('https://app.test/api/ocr/cheque', {
        headers: {
          'x-user-id': 'forged',
          'x-diagnostic-session-id': 'secret/../invalid',
        },
      }),
      'ocr.extract',
      async () => {
        expect(Sentry.getIsolationScope().getUser()?.id).toBeUndefined()
        expect(
          Sentry.getIsolationScope().getScopeData().tags.diagnostic_session_id,
        ).toBeUndefined()
        return new Response('ok')
      },
    )
  })

  it('adds isolated request correlation to Pino without raw payload data', async () => {
    output.info.mockClear()
    try {
      const diagnosticId = '8f18d494-b278-43f1-b845-40706c779f72'
      const response = await withMonitoringRequest(
        new Request('https://app.test/api/ocr/cheque', {
          headers: { 'x-diagnostic-session-id': diagnosticId },
        }),
        'ocr.extract',
        async () => {
          logger.info('OCR processing started', {
            imageUrl: 'private-document',
            account_number: '123456789',
          })
          return new Response('ok')
        },
      )
      const log = JSON.stringify(output.info.mock.calls)
      expect(log).toContain(diagnosticId)
      expect(log).toContain(response.headers.get('x-request-id'))
      expect(log).not.toMatch(/private-document|123456789/)
    } finally {
      output.info.mockClear()
    }
  })
})
