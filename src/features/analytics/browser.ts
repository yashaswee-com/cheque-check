'use client'

import {
  ATTRIBUTION_KEY,
  CONSENT_CHANGE_EVENT,
  CONSENT_KEY,
  MARKETING_ACTIVITY_EVENT,
  NINETY_DAYS_MS,
  SESSION_IDLE_MS,
  SESSION_KEY,
  campaignTouch,
  isPixelLocationSafe,
  isPixelReferrerSafe,
  marketingEnabled,
  marketingRoute,
  pixelEnabled,
  readMarketingConsent,
} from './contracts'
import {
  requestSchema,
  responseSchema,
  touchSchema,
  type BrowserEvent,
  type MarketingRequest,
} from '@/validators/marketing-analytics'
import { logger } from '@/lib/logger'

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: MetaPixelFunction
  loaded?: boolean
  version?: string
  initialized?: boolean
}
declare global {
  interface Window {
    fbq?: MetaPixelFunction
    _fbq?: MetaPixelFunction
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1782530103005623'
let serial: Promise<unknown> = Promise.resolve()

function initializePixel() {
  if (!window.fbq) {
    const fbq: MetaPixelFunction = Object.assign(
      (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args)
        else fbq.queue.push(args)
      },
      {
        queue: [] as unknown[][],
        push: undefined as MetaPixelFunction | undefined,
      },
    ) as MetaPixelFunction
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = window._fbq = fbq
    const script = document.createElement('script')
    script.id = 'meta-pixel-script'
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    script.onerror = () => logger.warn('Marketing pixel could not load')
    document.head.appendChild(script)
  }
  if (!window.fbq.initialized) {
    window.fbq('set', 'autoConfig', false, PIXEL_ID)
    window.fbq('init', PIXEL_ID)
    window.fbq.initialized = true
  }
  window.fbq('consent', 'grant')
  return window.fbq
}

function sendPixelEvent(event: BrowserEvent) {
  if (
    !pixelEnabled() ||
    !readMarketingConsent() ||
    !isPixelLocationSafe(new URL(location.href)) ||
    !isPixelReferrerSafe(document.referrer, location.origin)
  )
    return
  const data: Record<string, unknown> = {
    event_category: event.event_name,
    ...event.details,
  }
  if (typeof event.details.amount_paise === 'number') {
    data.value = event.details.amount_paise / 100
    data.content_type = 'product'
    data.content_ids = [event.details.product_id]
  }
  const standard = [
    'PageView',
    'CompleteRegistration',
    'InitiateCheckout',
    'Purchase',
  ].includes(event.meta_event_name)
  initializePixel()(
    standard ? 'track' : 'trackCustom',
    event.meta_event_name,
    data,
    { eventID: event.id },
  )
}

export function clearMarketingStorage() {
  window.fbq?.('consent', 'revoke')
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
    const parts = location.hostname.split('.')
    for (let i = 0; i < parts.length - 1; i++)
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${parts.slice(i).join('.')}; SameSite=Lax`
  }
  localStorage.removeItem(ATTRIBUTION_KEY)
  localStorage.removeItem(SESSION_KEY)
}

function browserContext(passive: boolean) {
  const now = Date.now()
  const savedSession = localStorage.getItem(SESSION_KEY)
  let session: { id: string; lastActivity: number } | undefined
  if (savedSession) {
    const parsed: unknown = JSON.parse(savedSession)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'id' in parsed &&
      'lastActivity' in parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.lastActivity === 'number' &&
      /^[0-9a-f-]{36}$/.test(parsed.id) &&
      now - parsed.lastActivity < SESSION_IDLE_MS
    )
      session = {
        id: parsed.id,
        lastActivity: passive ? parsed.lastActivity : now,
      }
  }
  if (passive && !session) return null
  session ??= { id: crypto.randomUUID(), lastActivity: now }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  const touch = campaignTouch(new URL(location.href), document.referrer)
  const saved = localStorage.getItem(ATTRIBUTION_KEY)
  let first = touch
  let last = touch
  let expiresAt = now + NINETY_DAYS_MS
  if (saved) {
    const parsed: unknown = JSON.parse(saved)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'expiresAt' in parsed &&
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > now &&
      'first' in parsed &&
      'last' in parsed
    ) {
      first = touchSchema.parse(parsed.first)
      last = Object.keys(touch).length ? touch : touchSchema.parse(parsed.last)
      expiresAt = parsed.expiresAt
    }
  }
  localStorage.setItem(
    ATTRIBUTION_KEY,
    JSON.stringify({ first, last, expiresAt }),
  )
  const fbclid = requestSchema.shape.fbclid.safeParse(
    new URL(location.href).searchParams.get('fbclid'),
  )
  return {
    sessionId: session.id,
    firstTouch: first,
    lastTouch: last,
    fbclid: fbclid.success ? fbclid.data : undefined,
  }
}

export function syncMarketing(
  action: MarketingRequest['action'] = 'sync',
  options: {
    explicitChoice?: boolean
    feature?: MarketingRequest['feature']
    passive?: boolean
    acceptedOverride?: boolean
  } = {},
) {
  if (!marketingEnabled()) return Promise.resolve(true)
  // Serialize consent updates and event claims within a tab.
  const run = async () => {
    const accepted = options.acceptedOverride ?? readMarketingConsent()
    const hasChoice =
      options.explicitChoice || localStorage.getItem(CONSENT_KEY) !== null
    if (options.passive && !hasChoice) return
    const context = accepted ? browserContext(options.passive ?? false) : {}
    if (!context) return
    const response = await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        action,
        accepted,
        hasChoice,
        explicitChoice: options.explicitChoice ?? false,
        feature: options.feature,
        route: marketingRoute(location.pathname),
        ...context,
      }),
    })
    if (!response.ok)
      throw new Error(`Marketing analytics request failed (${response.status})`)
    const result = responseSchema.parse(await response.json())
    if (accepted && !result.accepted) {
      localStorage.setItem(CONSENT_KEY, 'rejected')
      clearMarketingStorage()
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
      return
    }
    if (result.accepted) result.events.forEach(sendPixelEvent)
  }
  const locked = async () => {
    if (navigator.locks)
      await navigator.locks.request('cheque-check:marketing-sync', run)
    else await run()
  }
  const next = serial.then(locked, locked)
  const settled = next.then(
    () => true,
    (error: unknown) => {
      logger.error('Marketing analytics synchronization failed', error)
      return false
    },
  )
  serial = settled
  return settled
}

export function notifyMarketingActivity() {
  window.dispatchEvent(new Event(MARKETING_ACTIVITY_EVENT))
}

export function reportMarketingBlock(
  feature: NonNullable<MarketingRequest['feature']>,
) {
  void syncMarketing('blocked', { feature })
}
