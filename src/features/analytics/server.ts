import 'server-only'

import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { NINETY_DAYS_MS, isPixelLocationSafe } from './contracts'
import {
  requestSchema,
  browserEventsSchema,
  cookieSchema,
  type MarketingCookie,
} from '@/validators/marketing-analytics'
import type { Json } from '@/types/database.types'

const COOKIE_NAME = 'cc_marketing'

export function hashMatchingValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function cookieSignature(value: string) {
  const secret = process.env.MARKETING_COOKIE_SECRET
  if (!secret || secret.length < 32)
    throw new Error('Marketing cookie signing is not configured')
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function encodeMarketingCookie(value: MarketingCookie) {
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encoded}.${cookieSignature(encoded)}`
}

export function decodeMarketingCookie(value: string | undefined) {
  if (!value) return null
  const [encoded, signature, extra] = value.split('.')
  if (!encoded || !signature || extra) return null
  const expected = Buffer.from(cookieSignature(encoded))
  const provided = Buffer.from(signature)
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return null
  try {
    const parsed = cookieSchema.safeParse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    )
    return parsed.success && parsed.data.expiresAt > Date.now()
      ? parsed.data
      : null
  } catch {
    logger.warn('Invalid marketing consent cookie')
    return null
  }
}

export function matchingData(
  user: User | null,
  request: Request,
  fbp?: string,
  fbc?: string,
) {
  const data: Record<string, Json> = {}
  if (user) {
    data.external_id = [hashMatchingValue(user.id)]
    if (user.email && user.email_confirmed_at)
      data.em = [hashMatchingValue(user.email.trim().toLowerCase())]
    if (user.phone && user.phone_confirmed_at)
      data.ph = [hashMatchingValue(user.phone.replace(/\D/g, ''))]
  }
  const trustedHeader = process.env.MARKETING_TRUSTED_IP_HEADER
  if (trustedHeader) {
    const ip = request.headers.get(trustedHeader)?.split(',')[0].trim()
    if (ip && isIP(ip)) data.client_ip_address = ip
  }
  const agent = request.headers.get('user-agent')
  if (agent) data.client_user_agent = agent.slice(0, 500)
  if (fbp && /^fb\.\d\.\d{10,16}\.\d+$/.test(fbp)) data.fbp = fbp
  if (fbc && /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(fbc))
    data.fbc = fbc
  return data
}

function enabled() {
  return process.env.NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED === 'true'
}

export async function handleMarketingRequest(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin not allowed' }, { status: 403 })
  if (!enabled()) return Response.json({ accepted: false, events: [] })
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    return Response.json({ error: 'Request too large' }, { status: 413 })
  let input: unknown
  try {
    const body = await request.text()
    if (body.length > 8192)
      return Response.json({ error: 'Request too large' }, { status: 413 })
    input = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success)
    return Response.json(
      { error: 'Invalid analytics request' },
      { status: 400 },
    )
  const body = parsed.data
  try {
    const jar = await cookies()
    const previous = decodeMarketingCookie(jar.get(COOKIE_NAME)?.value)
    const accepted =
      body.accepted &&
      request.headers.get('sec-gpc') !== '1' &&
      request.headers.get('dnt') !== '1'
    const client = await createClient()
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser()
    if (authError && authError.name !== 'AuthSessionMissingError')
      throw authError
    const admin = createAdminClient()
    const now = Date.now()
    const identity = previous ?? {
      visitor: crypto.randomUUID(),
      acceptedAt: now,
      expiresAt: now + NINETY_DAYS_MS,
    }
    if (accepted && body.explicitChoice) identity.acceptedAt = now
    const sourceUrl = `${new URL(request.url).origin}${body.route === '/app' ? '/dashboard' : body.route}`
    const context = {
      source_url: sourceUrl,
      first_touch: body.firstTouch ?? {},
      last_touch: body.lastTouch ?? {},
      attribution_expires_at: new Date(identity.expiresAt).toISOString(),
    }
    const storedFbp = jar.get('_fbp')?.value
    const fbp =
      storedFbp && /^fb\.\d\.\d{10,16}\.\d+$/.test(storedFbp)
        ? storedFbp
        : `fb.1.${now}.${randomInt(1, 2147483647)}`
    const savedFbc = jar.get('_fbc')?.value
    const fbc =
      body.fbclid && !savedFbc?.endsWith(`.${body.fbclid}`)
        ? `fb.1.${now}.${body.fbclid}`
        : savedFbc
    const matching = accepted ? matchingData(user, request, fbp, fbc) : {}
    // Unknown consent on another device must not revoke an existing account choice.
    const privacyOptOut =
      request.headers.get('sec-gpc') === '1' ||
      request.headers.get('dnt') === '1'
    if (!body.hasChoice && !privacyOptOut) {
      if (
        user &&
        (body.route === '/onboarding' || body.action === 'onboarding_completed')
      ) {
        const { error } = await admin.rpc('marketing_onboarding', {
          owner: user.id,
          completed: body.action === 'onboarding_completed',
          tracking_allowed: false,
        })
        if (error) throw error
      }
      return Response.json({ accepted: false, events: [] })
    }
    if (accepted) {
      const rateSubject = createHmac('sha256', cookieSignature('rate-limit'))
        .update(
          user?.id ?? String(matching.client_ip_address ?? identity.visitor),
        )
        .digest('hex')
      const { data: admitted, error } = await admin.rpc(
        'marketing_admit_ingress',
        { subject: rateSubject },
      )
      if (error) throw error
      if (typeof admitted !== 'boolean')
        throw new Error('Invalid marketing rate limit response')
      if (!admitted)
        return Response.json(
          { error: 'Analytics rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': '60' } },
        )
    }
    const { data: allowed, error } = await admin.rpc('marketing_sync', {
      owner: user?.id ?? null,
      accepted,
      explicit_choice: body.explicitChoice,
      accepted_at: new Date(identity.acceptedAt).toISOString(),
      event_context: context,
      match_data: matching,
      visitor: previous?.visitor ?? identity.visitor,
    })
    if (error) throw error
    if (typeof allowed !== 'boolean')
      throw new Error('Invalid marketing consent response')
    if (
      user &&
      (body.route === '/onboarding' || body.action === 'onboarding_completed')
    ) {
      const { error } = await admin.rpc('marketing_onboarding', {
        owner: user.id,
        completed: body.action === 'onboarding_completed',
      })
      if (error) throw error
    }
    if (!allowed || !accepted) {
      jar.delete(COOKIE_NAME)
      jar.delete('_fbp')
      jar.delete('_fbc')
      return Response.json({ accepted: false, events: [] })
    }
    jar.set(COOKIE_NAME, encodeMarketingCookie(identity), {
      httpOnly: true,
      secure: new URL(request.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      expires: new Date(identity.expiresAt),
    })
    const metaCookies: [string, string | undefined][] = [
      ['_fbp', fbp],
      ['_fbc', fbc],
    ]
    for (const [name, value] of metaCookies) {
      if (value)
        jar.set(name, value, {
          secure: new URL(request.url).protocol === 'https:',
          sameSite: 'lax',
          path: '/',
          expires: new Date(identity.expiresAt),
        })
    }
    if (body.action === 'blocked') {
      if (!user || !body.feature)
        return Response.json(
          { error: 'Authenticated feature required' },
          { status: 400 },
        )
      const { error } = await admin.rpc('marketing_blocked', {
        owner: user.id,
        feature: body.feature,
      })
      if (error) throw error
    }
    const referer = request.headers.get('referer')
    const safePixel =
      referer &&
      URL.canParse(referer) &&
      new URL(referer).origin === new URL(request.url).origin &&
      isPixelLocationSafe(new URL(referer)) &&
      process.env.NEXT_PUBLIC_APP_ENV === 'production' &&
      process.env.NEXT_PUBLIC_DEPLOYMENT_KIND === 'production'
    const { data: events, error: eventError } = await admin.rpc(
      'marketing_browser_events',
      {
        owner: user?.id ?? null,
        visitor: identity.visitor,
        session: body.sessionId ?? null,
        route: body.action === 'sync' ? body.route : '/app',
        event_context: context,
        match_data: matching,
        claim_browser: Boolean(safePixel),
      },
    )
    if (eventError) throw eventError
    return Response.json({
      accepted: true,
      events: browserEventsSchema.parse(events),
    })
  } catch (error) {
    logger.error('Marketing analytics request failed', error)
    return Response.json(
      { error: 'Analytics temporarily unavailable' },
      { status: 503 },
    )
  }
}
