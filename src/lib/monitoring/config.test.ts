import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const keys = [
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_APP_RELEASE',
  'NEXT_PUBLIC_DEPLOYMENT_KIND',
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED',
  'NEXT_PUBLIC_MONITORING_POLICY_APPROVED',
  'NEXT_PUBLIC_CLARITY_ENABLED',
  'NEXT_PUBLIC_REPLAY_ENABLED',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_CLARITY_PROJECT_ID',
] as const

beforeEach(() => {
  vi.resetModules()
  for (const key of keys) vi.stubEnv(key, undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('monitoring deployment policy', () => {
  it('keeps QA hosted monitoring enabled for Sentry', () => {
    const qaEnv = readFileSync(join(process.cwd(), '.env.qa'), 'utf8')

    expect(qaEnv).toContain('NEXT_PUBLIC_OBSERVABILITY_ENABLED=true')
    expect(qaEnv).toContain('NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED=true')
    expect(qaEnv).toContain('NEXT_PUBLIC_MONITORING_POLICY_APPROVED=true')
  })

  it('remains disabled in tests even with opted-in valid configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'qa')
    vi.stubEnv('NEXT_PUBLIC_APP_RELEASE', 'release')
    vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_ENABLED', 'true')
    expect((await import('./config')).monitoringConfig.enabled).toBe(false)
  })

  it.each([
    {
      app: undefined,
      kind: undefined,
      flag: 'false',
      preview: 'false',
      enabled: false,
      deployment: 'development',
    },
    {
      app: 'qa',
      kind: undefined,
      flag: 'false',
      preview: 'false',
      enabled: false,
      deployment: 'qa',
    },
    {
      app: 'qa',
      kind: 'qa',
      flag: 'true',
      preview: 'false',
      enabled: true,
      deployment: 'qa',
    },
    {
      app: 'qa',
      kind: 'preview',
      flag: 'true',
      preview: 'false',
      enabled: false,
      deployment: 'preview',
    },
    {
      app: 'qa',
      kind: 'preview',
      flag: 'true',
      preview: 'true',
      enabled: true,
      deployment: 'preview',
    },
  ])(
    'enforces deployment policy for $deployment (enabled=$enabled)',
    async ({ app, kind, flag, preview, enabled, deployment }) => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_APP_ENV', app)
      vi.stubEnv('NEXT_PUBLIC_APP_RELEASE', 'release')
      vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_KIND', kind)
      vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_ENABLED', flag)
      vi.stubEnv('NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED', preview)
      vi.stubEnv('NEXT_PUBLIC_MONITORING_POLICY_APPROVED', 'true')
      vi.stubEnv('NEXT_PUBLIC_CLARITY_ENABLED', 'true')
      vi.stubEnv('NEXT_PUBLIC_REPLAY_ENABLED', 'true')
      vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', 'qa123')
      const { monitoringConfig } = await import('./config')
      expect(monitoringConfig).toMatchObject({
        enabled,
        deploymentKind: deployment,
        clarityEnabled: enabled,
        replayEnabled: enabled,
        policyApproved: true,
        clarityProjectId: 'qa123',
      })
    },
  )
})
