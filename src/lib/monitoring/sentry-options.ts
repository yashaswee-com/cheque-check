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
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
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
    beforeSendSpan: (span) => {
      const operation = span.attributes['sentry.op']
      return {
        ...span,
        name: typeof operation === 'string' ? operation : 'operation',
        attributes: safeContext(span.attributes),
      }
    },
  } satisfies BrowserOptions
}
