import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_KEY,
  SESSION_KEY,
  ATTRIBUTION_KEY,
  SESSION_IDLE_MS,
  campaignTouch,
  isPixelLocationSafe,
  setSessionMarketingOptOut,
} from './contracts'
import { syncMarketing } from './browser'
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const send = vi.fn<typeof fetch>()
beforeEach(() => {
  localStorage.clear()
  setSessionMarketingOptOut(false)
  localStorage.setItem(CONSENT_KEY, 'accepted')
  history.replaceState(null, '', '/')
  vi.stubEnv('NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED', 'true')
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_KIND', 'production')
  vi.stubGlobal('fetch', send)
  send
    .mockReset()
    .mockImplementation(async () =>
      Response.json({ accepted: true, events: [] }),
    )
  delete window.fbq
  delete window._fbq
  document.querySelector('#meta-pixel-script')?.remove()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'doNotTrack')
})
const sent = () => JSON.parse(String(send.mock.calls.at(-1)?.[1]?.body))

describe('browser marketing attribution and sessions', () => {
  it('retains the same shared-browser session until 30 minutes of inactivity', async () => {
    vi.useFakeTimers()
    await syncMarketing()
    const initial = sent().sessionId
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS - 1)
    await syncMarketing()
    expect(sent().sessionId).toBe(initial)
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS + 1)
    await syncMarketing()
    expect(sent().sessionId).not.toBe(initial)
  })
  it('does not keep sessions alive through background polling', async () => {
    vi.useFakeTimers()
    await syncMarketing()
    const saved = localStorage.getItem(SESSION_KEY)
    vi.setSystemTime(Date.now() + 15_000)
    await syncMarketing('sync', { passive: true })
    expect(localStorage.getItem(SESSION_KEY)).toBe(saved)
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS)
    const before = send.mock.calls.length
    await syncMarketing('sync', { passive: true })
    expect(send.mock.calls.length).toBe(before)
  })
  it('allows ad attribution without copying arbitrary query parameters', async () => {
    history.replaceState(
      null,
      '',
      '/?utm_source=meta&utm_campaign=launch&fbclid=click_123&secret=never-log-this',
    )
    await syncMarketing()
    expect(sent()).toMatchObject({
      firstTouch: { utm_source: 'meta', utm_campaign: 'launch' },
      fbclid: 'click_123',
    })
    expect(JSON.stringify(sent())).not.toContain('never-log-this')
    expect(window.fbq).toBeUndefined()
  })
  it('keeps first touch and updates last touch for a new campaign', async () => {
    history.replaceState(null, '', '/?utm_source=meta&utm_campaign=first')
    await syncMarketing()
    history.replaceState(
      null,
      '',
      '/signup?utm_source=search&utm_campaign=last',
    )
    await syncMarketing()
    expect(sent()).toMatchObject({
      firstTouch: { utm_source: 'meta', utm_campaign: 'first' },
      lastTouch: { utm_source: 'search', utm_campaign: 'last' },
    })
    expect(localStorage.getItem(ATTRIBUTION_KEY)).toBeTruthy()
  })
  it('only lets approved query values reach browser Pixel page URLs', () => {
    expect(
      isPixelLocationSafe(
        new URL('https://example.test/?utm_source=meta&fbclid=abc_123'),
      ),
    ).toBe(true)
    expect(
      isPixelLocationSafe(new URL('https://example.test/signup?token=private')),
    ).toBe(false)
    expect(
      isPixelLocationSafe(new URL('https://example.test/dashboard#private')),
    ).toBe(false)
    expect(
      isPixelLocationSafe(new URL('https://example.test/cheques/private-id')),
    ).toBe(false)
    expect(
      campaignTouch(
        new URL('https://example.test/?utm_term=person%40example.test'),
        '',
      ),
    ).toEqual({})
  })
  it('uses the persisted server event ID for browser/server deduplication', async () => {
    const id = crypto.randomUUID()
    send.mockResolvedValue(
      Response.json({
        accepted: true,
        events: [
          {
            id,
            event_name: 'signup_success',
            meta_event_name: 'CompleteRegistration',
            details: {},
          },
        ],
      }),
    )
    await syncMarketing()
    expect(window.fbq?.queue).toContainEqual([
      'track',
      'CompleteRegistration',
      { event_category: 'signup_success' },
      { eventID: id },
    ])
    expect(document.querySelector('#meta-pixel-script')).not.toBeNull()
  })
  it('never loads the production browser Pixel in QA', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'qa')
    send.mockResolvedValue(
      Response.json({
        accepted: true,
        events: [
          {
            id: crypto.randomUUID(),
            event_name: 'first_cheque',
            meta_event_name: 'FirstChequeAdded',
            details: {},
          },
        ],
      }),
    )
    await syncMarketing()
    expect(window.fbq).toBeUndefined()
  })
  it('reports request failures rather than pretending consent was saved', async () => {
    send.mockResolvedValue(new Response(null, { status: 503 }))
    expect(await syncMarketing()).toBe(false)
  })
})
