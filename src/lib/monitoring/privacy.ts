import type { Breadcrumb, Event } from '@sentry/nextjs'

const contextKeys = new Set([
  'operation',
  'outcome',
  'code',
  'status',
  'duration_ms',
  'business_id',
  'entity_id',
  'entity_type',
  'diagnostic_session_id',
  'request_id',
  'digest',
  'language',
  'timezone',
  'currency',
  'tier',
  'entitlement',
  'environment',
  'release',
  'deployment_kind',
  'runtime',
  'route',
  'method',
  'sentry.op',
])

export function safeRoute(value: string): string {
  try {
    const pathname = new URL(
      value.replace(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, ''),
      'https://app.invalid',
    ).pathname
    if (pathname.startsWith('/api/storage/')) return '/api/storage/[private]'
    return pathname
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]')
      .replace(/\/\d+(?=\/|$)/g, '/[id]')
      .slice(0, 200)
  } catch {
    return '[invalid-url]'
  }
}

export function safeText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:Bearer\s+\S+|eyJ[\w.-]+|sk-[\w-]+)\b/gi, '[credential]')
    .replace(/(["'`]).*?\1/g, '[value]')
    .replace(/\b\d[\d.,:+-]*\b/g, '[number]')
    .slice(0, 300)
}

export function safeContext(
  value: unknown,
): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string | number | boolean> = {}
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (!contextKeys.has(key)) continue
    if (typeof item === 'string') {
      result[key] =
        key === 'route'
          ? safeRoute(item)
          : item.replace(/[^a-zA-Z0-9_./:@[\]-]/g, '_').slice(0, 160)
    } else if (
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    ) {
      result[key] = item
    }
  }
  return result
}

export function isExpectedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return [
    'ValidationError',
    'ConflictError',
    'NotFoundError',
    'AbortError',
  ].includes(error.name)
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'app.operation') {
    return {
      ...breadcrumb,
      message: undefined,
      data: safeContext(breadcrumb.data),
    }
  }
  if (breadcrumb.category === 'navigation') {
    return {
      category: 'navigation',
      timestamp: breadcrumb.timestamp,
      data: {
        from: safeRoute(String(breadcrumb.data?.from ?? '/')),
        to: safeRoute(String(breadcrumb.data?.to ?? '/')),
      },
    }
  }
  if (['fetch', 'xhr', 'http'].includes(breadcrumb.category ?? '')) {
    return {
      category: breadcrumb.category,
      timestamp: breadcrumb.timestamp,
      data: {
        url: safeRoute(String(breadcrumb.data?.url ?? '/')),
        method: String(breadcrumb.data?.method ?? 'GET').slice(0, 10),
        status_code: Number(breadcrumb.data?.status_code) || undefined,
      },
    }
  }
  return null
}

export function scrubEvent<EventType extends Event>(
  event: EventType,
): EventType {
  event.request = event.request
    ? {
        method: event.request.method,
        url: event.request.url ? safeRoute(event.request.url) : undefined,
      }
    : undefined
  event.user = event.user?.id
    ? {
        id: event.user.id,
        email: event.user.email,
        username: event.user.username,
      }
    : undefined
  event.extra = safeContext(event.extra)
  event.tags = safeContext(event.tags)
  event.message = event.message ? safeText(event.message) : undefined
  event.logentry = undefined
  event.transaction = event.transaction
    ? safeRoute(event.transaction)
    : undefined
  event.breadcrumbs = event.breadcrumbs
    ?.map(scrubBreadcrumb)
    .filter((item): item is Breadcrumb => !!item)
  if (event.contexts) {
    event.contexts = {
      trace: event.contexts.trace
        ? {
            trace_id: event.contexts.trace.trace_id,
            span_id: event.contexts.trace.span_id,
            parent_span_id: event.contexts.trace.parent_span_id,
            op: event.contexts.trace.op,
            status: event.contexts.trace.status,
            data: safeContext(event.contexts.trace.data),
          }
        : undefined,
      app: safeContext(event.contexts.app),
      replay: event.contexts.replay?.replay_id
        ? { replay_id: event.contexts.replay.replay_id }
        : undefined,
      browser: event.contexts.browser
        ? {
            name: event.contexts.browser.name,
            version: event.contexts.browser.version,
          }
        : undefined,
      os: event.contexts.os
        ? { name: event.contexts.os.name, version: event.contexts.os.version }
        : undefined,
    }
  }
  for (const exception of event.exception?.values ?? []) {
    exception.value =
      'Exception message withheld; inspect stack and operation context'
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.vars = undefined
      frame.pre_context = undefined
      frame.post_context = undefined
      frame.context_line = undefined
      if (frame.filename) frame.filename = frame.filename.split(/[?#]/)[0]
      if (frame.abs_path) frame.abs_path = frame.abs_path.split(/[?#]/)[0]
    }
  }
  for (const span of event.spans ?? []) {
    span.description = span.op
    span.data = safeContext(span.data)
  }
  return event
}
