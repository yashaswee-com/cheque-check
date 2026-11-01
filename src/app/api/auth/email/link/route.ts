import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { emailLinkSchema } from '@/validators/email-link'
import { logger } from '@/lib/logger'
import { withMonitoringRequest } from '@/lib/monitoring/server'
import { TABLES } from '@/lib/supabase/tables'
export async function POST(request: Request) {
  return withMonitoringRequest(request, 'auth.email_link', async () => {
    try {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
      }
      const parsed = emailLinkSchema.safeParse(body)
      if (!parsed.success)
        return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
      const supabase = await createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      const { data: profile, error: profileError } = await supabase
        .from(TABLES.PROFILES)
        .select('deleted_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile || profile.deleted_at)
        return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
      if (user.email && user.email_confirmed_at)
        return NextResponse.json({ error: 'already_linked' }, { status: 409 })
      const { data: allowed, error: rateError } = await supabase.rpc(
        'consume_api_rate_limit',
        {
          requested_endpoint: 'email-link-send',
          request_limit: 5,
          window_seconds: 3600,
        },
      )
      if (rateError) throw rateError
      if (!allowed)
        return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
      const { error } = await supabase.auth.updateUser(
        { email: parsed.data.email },
        {
          emailRedirectTo: `${new URL(request.url).origin}/auth/callback?next=/profile`,
        },
      )
      if (error) {
        logger.error('Email link verification request failed', error)
        const code =
          error.code === 'email_exists'
            ? 'email_in_use'
            : error.status === 429
              ? 'rate_limited'
              : 'send_failed'
        return NextResponse.json(
          { error: code },
          {
            status:
              code === 'email_in_use'
                ? 409
                : code === 'rate_limited'
                  ? 429
                  : 503,
          },
        )
      }
      // Sending verification is not proof of ownership; only Auth confirmation links it.
      return NextResponse.json({ pending: true })
    } catch (error) {
      logger.error('Email linking failed', error)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }
  })
}
