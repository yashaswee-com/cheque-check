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

function normalizedPath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPublicPagePath(pathname: string) {
  return PUBLIC_PAGE_PATHS.has(normalizedPath(pathname))
}

export function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.has(normalizedPath(pathname))
}
