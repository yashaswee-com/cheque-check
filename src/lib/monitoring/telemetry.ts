import * as Sentry from '@sentry/nextjs'
import { monitoringConfig } from './config'
import { clarityEvent, diagnosticHeaders, getDiagnosticId } from './browser'
import { safeContext, safeRoute } from './privacy'

export function recordOperation(
  operation: string,
  outcome: 'started' | 'success' | 'failure',
  values: Record<string, unknown> = {},
) {
  if (!monitoringConfig.enabled) return
  try {
    const data = safeContext({
      ...values,
      operation,
      outcome,
      diagnostic_session_id: getDiagnosticId(),
    })
    if (data.diagnostic_session_id)
      Sentry.setTag('diagnostic_session_id', data.diagnostic_session_id)
    Sentry.addBreadcrumb({
      category: 'app.operation',
      level: outcome === 'failure' ? 'warning' : 'info',
      data,
    })
    if (typeof window !== 'undefined')
      clarityEvent(`${operation}.${outcome}`, outcome === 'failure')
  } catch {}
}

export async function monitorOperation<Result>(
  operation: string,
  action: () => Promise<Result>,
  values: Record<string, unknown> = {},
): Promise<Result> {
  if (!monitoringConfig.enabled) return action()
  const start = Date.now()
  recordOperation(operation, 'started', values)
  return Sentry.startSpan(
    { name: operation, op: 'app.operation', attributes: safeContext(values) },
    async () => {
      try {
        const result = await action()
        recordOperation(operation, 'success', {
          ...values,
          duration_ms: Date.now() - start,
        })
        return result
      } catch (error) {
        recordOperation(operation, 'failure', {
          ...values,
          duration_ms: Date.now() - start,
        })
        throw error
      }
    },
  )
}

export async function monitoredFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (!monitoringConfig.enabled) return fetch(input, init)
  const origin =
    typeof window !== 'undefined' ? location.origin : 'https://app.invalid'
  const url = new URL(input, origin)
  if (url.origin !== origin || !url.pathname.startsWith('/api/'))
    return fetch(input, init)
  const headers = new Headers(init?.headers)
  for (const [key, value] of Object.entries(diagnosticHeaders()))
    headers.set(key, value)
  const response = await fetch(input, { ...init, headers })
  recordOperation('api.request', response.ok ? 'success' : 'failure', {
    route: safeRoute(input),
    method: init?.method ?? 'GET',
    status: response.status,
    request_id: response.headers.get('x-request-id'),
  })
  return response
}

export function recordFeedbackSubmission(values: Record<string, unknown>) {
  recordOperation('feedback.submit', 'success', values)
  if (monitoringConfig.enabled) {
    Sentry.captureMessage('feedback.submitted', {
      level: 'info',
      extra: safeContext({
        ...values,
        diagnostic_session_id: getDiagnosticId(),
      }),
    })
  }
}
