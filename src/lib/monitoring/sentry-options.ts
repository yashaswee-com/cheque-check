import type { BrowserOptions } from '@sentry/nextjs'
import { monitoringConfig } from './config'
import {
  isExpectedError,
  safeContext,
  scrubBreadcrumb,
  scrubEvent,
} from './privacy'

export function sentryOptions(runtime: string) {
  return {
    enabled: monitoringConfig.enabled && !!monitoringConfig.dsn,
    dsn: monitoringConfig.dsn,
    environment: monitoringConfig.environment,
    release: monitoringConfig.release,
    sendDefaultPii: false,
    enableLogs: false,
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          !/^(OpenAI|Anthropic|GoogleGenAI|VercelAI|LocalVariables|Console)$/.test(
            integration.name,
          ),
      ),
    tracesSampleRate: monitoringConfig.tracesSampleRate,
    maxBreadcrumbs: 50,
    tracePropagationTargets: [
      /^\/api\/(?!storage\/)/,
      ...(runtime === 'browser' && typeof window !== 'undefined'
        ? [
            new RegExp(
              `^${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/(?!storage/)`,
            ),
          ]
        : []),
    ],
    initialScope: {
      tags: { runtime, deployment_kind: monitoringConfig.deploymentKind },
    },
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event, hint) =>
      isExpectedError(hint.originalException) ? null : scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeSendSpan: (span) => ({
      ...span,
      description: span.op,
      data: safeContext(span.data),
    }),
  } satisfies BrowserOptions
}
