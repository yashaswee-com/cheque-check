import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()
const appRelease =
  process.env.NEXT_PUBLIC_APP_RELEASE ||
  (process.env.VERCEL_GIT_COMMIT_SHA
    ? `cheque-check@${process.env.VERCEL_GIT_COMMIT_SHA}`
    : undefined)
const deploymentKind =
  process.env.VERCEL_ENV === 'preview'
    ? 'preview'
    : (process.env.NEXT_PUBLIC_APP_ENV ?? 'development')
const monitoringEnabled =
  process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED === 'true' &&
  (deploymentKind !== 'preview' ||
    process.env.NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED === 'true')
const uploadSourceMaps = monitoringEnabled && !!process.env.SENTRY_AUTH_TOKEN

if (
  process.env.VERCEL &&
  monitoringEnabled &&
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  !process.env.SENTRY_AUTH_TOKEN
) {
  throw new Error(
    'Enabled Sentry deployments require a build-only SENTRY_AUTH_TOKEN for source maps',
  )
}

const nextConfig: NextConfig = {
  env: {
    ...(appRelease ? { NEXT_PUBLIC_APP_RELEASE: appRelease } : {}),
    NEXT_PUBLIC_DEPLOYMENT_KIND: deploymentKind,
  },
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zreakkoweitwomhhohxd.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'zreakkoweitwomhhohxd.supabase.co',
        port: '',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
}

export default withNextIntl(
  withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-javascript/blob/master/nextjs/README.md#threading-options

    // Suppresses source map uploading logs during bundling
    silent: true,
    org: 'cheque-check',
    project: 'javascript-nextjs',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: {
      name: appRelease,
      create: uploadSourceMaps,
      finalize: uploadSourceMaps,
    },
    sourcemaps: {
      disable: !uploadSourceMaps,
      deleteSourcemapsAfterUpload: true,
    },

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: '/monitoring',

    // Enables automatic instrumentation of Vercel Cron Monitors.
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    webpack: {
      automaticVercelMonitors: true,
      treeshake: {
        removeDebugLogging: true,
      },
    },
  }),
)
