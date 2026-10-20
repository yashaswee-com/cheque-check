import * as Sentry from '@sentry/nextjs'
import { monitoringConfig } from './config'
import { safeContext, safeRoute } from './privacy'

export const trackingPreferenceKey = 'cheque-check:monitoring:v1'
export const trackingPreferenceEvent = 'cheque-check:monitoring-change'
const sessionKey = 'cheque-check:diagnostics:v1'
const idleLimit = 30 * 60 * 1000

type Clarity = (...args: unknown[]) => void
type ClarityQueue = Clarity & { q?: unknown[][] }
type MonitoringUser = { id: string; email?: string; name?: string }

declare global {
  interface Window {
    clarity?: ClarityQueue
  }
}

let user: MonitoringUser | null = null
let identityResolved = false
let context: Record<string, string | number | boolean> = {}
let currentRoute = '/'
let diagnosticId: string | undefined
let lastActivity = 0
let revision = 0
let recording = false
let clarityLoaded = false
let clarityBlocked = false
let script: HTMLScriptElement | undefined
let replayLoading: Promise<void> | undefined
let replayStopping: Promise<void> = Promise.resolve()

export function readTrackingPreference(): boolean {
  if (typeof window === 'undefined') return false
  if (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl ||
    navigator.doNotTrack === '1'
  )
    return false
  try {
    const preference = window.localStorage.getItem(trackingPreferenceKey)
    if (preference !== null) return preference === 'allowed'
  } catch {
    return false
  }
  return monitoringConfig.policyApproved
}

export function trackingAllowed(): boolean {
  return (
    monitoringConfig.enabled &&
    monitoringConfig.policyApproved &&
    readTrackingPreference()
  )
}

export function setTrackingPreference(allowed: boolean) {
  try {
    window.localStorage.setItem(
      trackingPreferenceKey,
      allowed ? 'allowed' : 'denied',
    )
  } catch {
    allowed = false
  }
  if (!allowed) void stopRecordings(true)
  window.dispatchEvent(new Event(trackingPreferenceEvent))
}

export function getDiagnosticId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const previous = diagnosticId
  if (!diagnosticId || Date.now() - lastActivity > idleLimit) {
    diagnosticId = undefined
    try {
      const stored = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null')
      if (
        stored &&
        stored.owner === (user?.id ?? null) &&
        Date.now() - stored.time < idleLimit &&
        /^[a-f0-9-]{36}$/.test(stored.id)
      ) {
        diagnosticId = stored.id
      }
    } catch {}
    diagnosticId ??= crypto.randomUUID()
    if (previous && previous !== diagnosticId) {
      Sentry.setTag('diagnostic_session_id', diagnosticId)
    }
  }
  lastActivity = Date.now()
  try {
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        id: diagnosticId,
        owner: user?.id ?? null,
        time: lastActivity,
      }),
    )
  } catch {}
  if (previous && previous !== diagnosticId) syncClarity()
  return diagnosticId
}

function clearClarityCookies() {
  const domains = location.hostname.split('.')
  const scopes = [
    '',
    ...domains
      .map((_, index) => domains.slice(index).join('.'))
      .filter((domain) => domain.includes('.')),
  ]
  for (const name of ['_clck', '_clsk']) {
    for (const domain of scopes) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}; SameSite=Lax`
    }
  }
}

export async function stopRecordings(reload = false) {
  revision += 1
  recording = false
  const replay = Sentry.getReplay?.()
  if (replay) replayStopping = replay.stop({ flush: false }).catch(() => {})
  const needsReload = clarityLoaded || !!script
  if (needsReload) {
    clarityBlocked = true
    try {
      window.clarity?.('stop')
    } catch {}
    script?.remove()
    window.clarity = () => {}
    clearClarityCookies()
  }
  if (reload && needsReload) location.reload()
}

export function setMonitoringUser(next: MonitoringUser | null) {
  if (typeof window === 'undefined') return
  if (user?.id !== next?.id) {
    const mustReload = clarityLoaded || !!script
    void stopRecordings(false)
    user = next
    context = {}
    diagnosticId = undefined
    lastActivity = 0
    if (identityResolved) {
      try {
        sessionStorage.removeItem(sessionKey)
      } catch {}
    }
    Sentry.setUser(null)
    Sentry.setContext('app', null)
    for (const key of [
      'business_id',
      'tier',
      'entitlement',
      'diagnostic_session_id',
    ])
      Sentry.setTag(key, undefined)
    Sentry.getCurrentScope().clearBreadcrumbs()
    if (mustReload) {
      location.reload()
      return
    }
  }
  identityResolved = true
  user = next
  if (monitoringConfig.enabled) {
    Sentry.setUser(
      next ? { id: next.id, email: next.email, username: next.name } : null,
    )
    Sentry.setTag('diagnostic_session_id', getDiagnosticId())
  }
}

function canRecord() {
  return (
    !!user &&
    trackingAllowed() &&
    !/^\/(?:login|signup|forgot-password|auth|settings\/password)(?:\/|$)/.test(
      currentRoute,
    )
  )
}

function syncClarity() {
  if (!clarityLoaded || clarityBlocked || !canRecord() || !user) return
  const clarity = window.clarity
  clarity?.('identify', user.id, getDiagnosticId(), currentRoute, user.name)
  if (user.email) clarity?.('set', 'email', user.email)
  for (const [key, value] of Object.entries({
    ...context,
    environment: monitoringConfig.environment,
    release: monitoringConfig.release,
    deployment_kind: monitoringConfig.deploymentKind,
  })) {
    if (value !== undefined) clarity?.('set', key, String(value))
  }
}

async function startReplay(version: number) {
  if (!monitoringConfig.replayEnabled || !monitoringConfig.dsn) return
  await replayStopping
  const sdk = await import('@sentry/nextjs')
  if (version !== revision || !canRecord()) return
  let replay = sdk.getReplay()
  if (!replay) {
    const client = sdk.getClient()
    if (!client) return
    const options = client.getOptions() as Sentry.BrowserOptions
    options.replaysSessionSampleRate = monitoringConfig.replaySampleRate
    options.replaysOnErrorSampleRate = monitoringConfig.errorReplaySampleRate
    replay = sdk.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      stickySession: false,
      networkCaptureBodies: false,
      block: [
        '[data-monitoring-private]',
        'iframe',
        'img',
        'video',
        'canvas',
        'svg',
      ],
      beforeErrorSampling: (event) => event.level !== 'info',
      beforeAddRecordingEvent: (event) => {
        if (!canRecord()) return null
        if (event.type === 5) return null
        return event
      },
    })
    sdk.addIntegration(replay)
  } else if (!replay.getReplayId()) {
    if (Math.random() < monitoringConfig.replaySampleRate) replay.start()
    else if (monitoringConfig.errorReplaySampleRate > 0) replay.startBuffering()
  }
}

export function syncMonitoringPage(
  pathname: string,
  values: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined') return
  currentRoute = safeRoute(pathname)
  context = safeContext({ ...values, route: currentRoute })
  if (monitoringConfig.enabled) {
    Sentry.setContext('app', context)
    Sentry.setTag('business_id', context.business_id)
    Sentry.setTag('tier', context.tier)
    Sentry.setTag('entitlement', context.entitlement)
    Sentry.setTag('diagnostic_session_id', getDiagnosticId())
  }
  if (!canRecord()) {
    if (recording || clarityLoaded) void stopRecordings(clarityLoaded)
    return
  }
  syncClarity()
  if (recording) return
  recording = true
  const version = revision
  replayLoading = (replayLoading ?? Promise.resolve())
    .then(() => startReplay(version))
    .catch(() => {})
  if (
    !monitoringConfig.clarityEnabled ||
    !monitoringConfig.clarityProjectId ||
    clarityBlocked ||
    script
  )
    return
  const queued: ClarityQueue = (...args) => {
    if (!clarityBlocked && canRecord()) queued.q?.push(args)
  }
  queued.q = []
  window.clarity = queued
  queued('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' })
  clearClarityCookies()
  script = document.createElement('script')
  script.id = 'microsoft-clarity'
  script.async = true
  script.src = `https://www.clarity.ms/tag/${monitoringConfig.clarityProjectId}`
  script.onload = () => {
    if (version !== revision || !canRecord()) {
      void stopRecordings(true)
      return
    }
    clarityLoaded = true
    syncClarity()
  }
  script.onerror = () => {
    script?.remove()
    script = undefined
  }
  document.head.appendChild(script)
}

export function clarityEvent(name: string, critical = false) {
  if (!canRecord() || !clarityLoaded || clarityBlocked) return
  try {
    window.clarity?.('event', name)
    if (critical) window.clarity?.('upgrade', name)
  } catch {}
}

export function diagnosticHeaders(): Record<string, string> {
  const id = monitoringConfig.enabled ? getDiagnosticId() : undefined
  return id ? { 'x-diagnostic-session-id': id } : {}
}
