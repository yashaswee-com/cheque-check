import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import { publicEnv } from '@/lib/env/client'
import { logger } from '@/lib/logger'
import { securityActionSchema, pinResultSchema } from '../validators/security'
import { pinDigest, proofDigest, randomSecret } from './crypto'

const failure = (error: string, status: number) =>
  NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
const json = (body: unknown) =>
  NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
export async function handleSecurity(request: Request) {
  try {
    if (request.method === 'POST') {
      const origin = request.headers.get('origin')
      if (origin && origin !== new URL(request.url).origin)
        return failure('unauthorized', 403)
    }
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return failure('unauthorized', 401)
    const { data: profile, error: profileError } = await supabase
      .from(TABLES.PROFILES)
      .select('deleted_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile || profile.deleted_at) return failure('unauthorized', 403)
    const admin = createAdminClient()
    const { data: pin, error: pinError } = await admin
      .from(TABLES.APPLICATION_PINS)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (pinError) throw pinError
    const email = Boolean(user.email && user.email_confirmed_at)
    const phone = Boolean(
      user.phone &&
      user.phone_confirmed_at &&
      publicEnv.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true',
    )
    if (request.method === 'GET')
      return json({
        enabled: Boolean(pin?.digest),
        blocked: (pin?.failures ?? 0) >= 5,
        revision: pin?.revision ?? null,
        emailOtp: email,
        phoneOtp: phone,
      })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return failure('invalid_input', 400)
    }
    const parsed = securityActionSchema.safeParse(body)
    if (!parsed.success) return failure('invalid_input', 400)
    const action = parsed.data
    const send = action.action === 'sendOtp'
    const { data: allowed, error: rateError } = await supabase.rpc(
      'consume_api_rate_limit',
      {
        requested_endpoint: send ? 'security-otp-send' : 'security-pin-action',
        request_limit: send ? 5 : 30,
        window_seconds: send ? 3600 : 300,
      },
    )
    if (rateError) throw rateError
    if (!allowed) return failure('rate_limited', 429)
    if (action.action === 'verify') {
      if (!pin?.digest || !pin.salt) return json({ status: 'changed' })
      const digest =
        pin.failures >= 5
          ? '0'.repeat(64)
          : await pinDigest(action.pin, pin.salt)
      const { data, error } = await admin.rpc('security_pin_check', {
        requested_user: user.id,
        requested_digest: digest,
        requested_revision: pin.revision,
      })
      if (error) throw error
      const result = pinResultSchema.parse(data)
      if (result.status === 'blocked') {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: 'global',
        })
        if (signOutError)
          logger.error('PIN lockout session revocation failed', signOutError)
      }
      return json(result)
    }
    if (action.action === 'set' || action.action === 'remove') {
      const salt = action.action === 'set' ? randomSecret() : undefined
      const digest =
        action.action === 'set' && salt
          ? await pinDigest(action.pin, salt)
          : undefined
      const { error } = await admin.rpc('security_pin_manage', {
        requested_user: user.id,
        requested_proof: proofDigest(action.proof),
        ...(digest && salt
          ? { requested_digest: digest, requested_salt: salt }
          : {}),
      })
      if (error) {
        if (error.code === 'P0001') return failure('fresh_auth_required', 403)
        throw error
      }
      return json({ saved: true })
    }
    if (action.action === 'sendOtp') {
      if (
        (action.channel === 'email' && !email) ||
        (action.channel === 'phone' && !phone)
      )
        return failure('identity_unavailable', 409)
      const { error } = await supabase.auth.signInWithOtp(
        action.channel === 'email'
          ? { email: user.email!, options: { shouldCreateUser: false } }
          : { phone: user.phone!, options: { shouldCreateUser: false } },
      )
      if (error) {
        logger.error('Security verification delivery failed', error)
        return failure('verification_failed', error.status === 429 ? 429 : 503)
      }
      return json({ sent: true })
    }
    if (
      (action.action === 'password' && !email && !phone) ||
      (action.action === 'otp' &&
        ((action.channel === 'email' && !email) ||
          (action.channel === 'phone' && !phone)))
    )
      return failure('identity_unavailable', 409)
    const { data, error } =
      action.action === 'password'
        ? await supabase.auth.signInWithPassword(
            email
              ? { email: user.email!, password: action.password }
              : { phone: user.phone!, password: action.password },
          )
        : await supabase.auth.verifyOtp(
            action.channel === 'email'
              ? { email: user.email!, token: action.token, type: 'email' }
              : { phone: user.phone!, token: action.token, type: 'sms' },
          )
    if (error || !data.user || data.user.id !== user.id) {
      if (error) logger.error('Security reauthentication failed', error)
      return failure('verification_failed', 403)
    }
    const proof = randomSecret()
    const { error: proofError } = await admin.rpc('security_pin_proof', {
      requested_user: user.id,
      requested_proof: proofDigest(proof),
    })
    if (proofError) throw proofError
    return json({ proof })
  } catch (error) {
    logger.error('App security request failed', error)
    return failure('unavailable', 503)
  }
}
