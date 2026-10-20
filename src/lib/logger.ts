import pino from 'pino'
import * as Sentry from '@sentry/nextjs'
import { publicEnv } from '@/lib/env/client'
import { monitoringConfig } from '@/lib/monitoring/config'
import { getDiagnosticId } from '@/lib/monitoring/browser'
import {
  isExpectedError,
  safeContext,
  safeText,
} from '@/lib/monitoring/privacy'

const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Universal logger using Pino.
 * In development, we use 'debug' level. In production, 'info'.
 * Logs are output as JSON strings for structured log management.
 */
const pinoLogger = pino({
  level: publicEnv.NEXT_PUBLIC_LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  browser: {
    asObject: true,
  },
})

const capturedErrors = new WeakMap<Error, string>()
const referenceListeners = new Set<() => void>()

export function subscribeErrorReferences(listener: () => void) {
  referenceListeners.add(listener)
  return () => {
    referenceListeners.delete(listener)
  }
}

export function getErrorReference(error?: Error) {
  return error ? capturedErrors.get(error) : undefined
}

function logContext(context?: Record<string, unknown>) {
  const tags = Sentry.getIsolationScope().getScopeData().tags
  return safeContext({
    ...tags,
    ...context,
    diagnostic_session_id: getDiagnosticId() ?? tags.diagnostic_session_id,
  })
}

function capture(
  level: 'error' | 'fatal',
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) {
  const extra = logContext({
    ...context,
    digest:
      error instanceof Error && 'digest' in error ? error.digest : undefined,
  })
  const safeMessage = safeText(message)
  const details =
    error instanceof Error
      ? {
          name: error.name,
          stack: error.stack?.split('\n').slice(1).join('\n'),
        }
      : undefined
  pinoLogger[isExpectedError(error) ? 'warn' : level](
    { ...extra, error: details },
    safeMessage,
  )
  if (error instanceof Error) {
    const previous = capturedErrors.get(error)
    if (previous) return previous
  }
  let reference = getDiagnosticId() ?? crypto.randomUUID()
  if (
    monitoringConfig.enabled &&
    monitoringConfig.dsn &&
    !isExpectedError(error)
  ) {
    reference =
      error instanceof Error
        ? Sentry.captureException(error, { level, extra })
        : Sentry.captureMessage(safeMessage, { level, extra })
  }
  if (error instanceof Error) {
    capturedErrors.set(error, reference)
    referenceListeners.forEach((listener) => listener())
  }
  return reference
}

export const logger = {
  debug: (msg: string, context?: Record<string, any>) => {
    if (context) {
      pinoLogger.debug(logContext(context), safeText(msg))
    } else {
      pinoLogger.debug(logContext(), safeText(msg))
    }
  },

  info: (msg: string, context?: Record<string, any>) => {
    if (context) {
      pinoLogger.info(logContext(context), safeText(msg))
    } else {
      pinoLogger.info(logContext(), safeText(msg))
    }
  },

  warn: (msg: string, context?: Record<string, any>) => {
    if (context) {
      pinoLogger.warn(logContext(context), safeText(msg))
    } else {
      pinoLogger.warn(logContext(), safeText(msg))
    }
  },

  /**
   * Logs an error and explicitly sends it to Sentry.
   */
  error: (msg: string, error?: unknown, context?: Record<string, any>) => {
    return capture('error', msg, error, context)
  },

  /**
   * Logs a fatal error and explicitly sends it to Sentry with fatal level.
   */
  fatal: (msg: string, error?: unknown, context?: Record<string, any>) => {
    return capture('fatal', msg, error, context)
  },
}
