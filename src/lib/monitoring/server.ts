import * as Sentry from '@sentry/nextjs'
import { monitoringConfig } from './config'
import { safeRoute } from './privacy'

export function setRequestUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}) {
  if (!monitoringConfig.enabled) return
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username:
      typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name.slice(0, 160)
        : undefined,
  })
}

export async function withMonitoringRequest(
  request: Request,
  operation: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID()
  const suppliedId = request.headers.get('x-diagnostic-session-id')
  const diagnosticId =
    suppliedId && /^[a-f0-9-]{36}$/i.test(suppliedId) ? suppliedId : undefined
  return Sentry.withIsolationScope(async (scope) => {
    scope.setUser(null)
    scope.setTag('request_id', requestId)
    scope.setTag('diagnostic_session_id', diagnosticId)
    scope.setTag('operation', operation)
    scope.setContext('app', {
      route: safeRoute(request.url),
      method: request.method,
    })
    const response = await Sentry.startSpan(
      { name: operation, op: 'http.server' },
      handler,
    )
    response.headers.set('x-request-id', requestId)
    return response
  })
}
