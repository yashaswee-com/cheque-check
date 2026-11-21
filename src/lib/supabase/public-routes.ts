const PUBLIC_PAGE_PATHS = new Set([
  '/',
  '/features',
  '/pricing',
  '/privacy',
  '/contact',
  '/cheque-bounce',
  '/legal-notice',
  '/sentry-example-page',
])

const PUBLIC_API_PATHS = new Set(['/api/contact', '/api/analytics/events'])

const PUBLIC_STATIC_PATHS = new Set([
  '/.well-known/security.txt',
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
  '/twitter-image',
])

function normalizedPath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPublicPagePath(pathname: string) {
  const normalized = normalizedPath(pathname)
  return (
    PUBLIC_PAGE_PATHS.has(normalized) ||
    /^\/(?:en|hi|hi-en)\/articles(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(
      normalized,
    )
  )
}

export function publicArticleLocale(pathname: string) {
  const match = normalizedPath(pathname).match(
    /^\/(en|hi|hi-en)\/articles(?:\/|$)/,
  )
  return match?.[1] as 'en' | 'hi' | 'hi-en' | undefined
}

export function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.has(normalizedPath(pathname))
}

export function isPublicStaticPath(pathname: string) {
  return PUBLIC_STATIC_PATHS.has(normalizedPath(pathname))
}
