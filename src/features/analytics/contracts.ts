import {
  campaignValue,
  type MarketingRequest,
  type MarketingTouch,
} from '@/validators/marketing-analytics'

export const CONSENT_KEY = 'cheque-check:meta-marketing-consent:v2'
export const CONSENT_CHANGE_EVENT = 'cheque-check:meta-consent-change'
export const OPEN_PREFERENCES_EVENT = 'cheque-check:open-meta-consent'
export const MARKETING_ACTIVITY_EVENT = 'cheque-check:marketing-activity'
export const ATTRIBUTION_KEY = 'cheque-check:marketing-attribution:v1'
export const SESSION_KEY = 'cheque-check:marketing-session:v1'
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
export const SESSION_IDLE_MS = 30 * 60 * 1000
let sessionOptOut = false
export function setSessionMarketingOptOut(value: boolean) {
  sessionOptOut = value
}
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export function marketingRoute(pathname: string): MarketingRequest['route'] {
  switch (pathname) {
    case '/':
    case '/signup':
    case '/onboarding':
    case '/dashboard':
    case '/premium':
      return pathname
    default:
      return '/app'
  }
}

export function hasTrackingOptOut() {
  return (
    navigator.doNotTrack === '1' ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  )
}

export function readMarketingConsent() {
  return (
    !sessionOptOut &&
    localStorage.getItem(CONSENT_KEY) === 'accepted' &&
    !hasTrackingOptOut()
  )
}

export function marketingEnabled() {
  return process.env.NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED === 'true'
}

export function pixelEnabled() {
  return (
    marketingEnabled() &&
    process.env.NEXT_PUBLIC_APP_ENV === 'production' &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_KIND === 'production'
  )
}

export function campaignTouch(url: URL, referrer: string) {
  const touch: MarketingTouch = {}
  for (const key of UTM_KEYS) {
    const parsed = campaignValue.safeParse(url.searchParams.get(key))
    if (parsed.success) touch[key] = parsed.data
  }
  if (referrer) {
    const parsed = URL.canParse(referrer) ? new URL(referrer) : null
    if (
      parsed &&
      parsed.origin !== url.origin &&
      /^https?:$/.test(parsed.protocol)
    )
      touch.referrer_origin = parsed.origin
  }
  return touch
}

export function isPixelLocationSafe(url: URL) {
  if (marketingRoute(url.pathname) === '/app' || url.hash) return false
  return [...url.searchParams].every(([key, value]) =>
    key === 'fbclid'
      ? /^[A-Za-z0-9_-]{1,500}$/.test(value)
      : UTM_KEYS.some((allowed) => allowed === key) &&
        campaignValue.safeParse(value).success,
  )
}

export function isPixelReferrerSafe(referrer: string, origin: string) {
  if (!referrer) return true
  if (!URL.canParse(referrer)) return false
  const url = new URL(referrer)
  return url.origin === origin
    ? isPixelLocationSafe(url)
    : url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        url.protocol === 'https:'
}
