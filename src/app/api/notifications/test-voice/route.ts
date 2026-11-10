import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { publicEnv } from '@/lib/env/client'
import { getSupabaseAdminEnv } from '@/lib/env/server'
import { logger } from '@/lib/logger'
import { TABLES } from '@/lib/supabase/tables'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'

const RATE_LIMIT_ENDPOINT = 'notifications-test-voice'
const RATE_LIMIT_REQUESTS = 1
const RATE_LIMIT_WINDOW_SECONDS = 300
const QUOTA_EXHAUSTED_ERROR = 'Voice reminder quota exhausted'

async function dispatchNow(
  serviceRoleKey: string,
  userId: string,
  jobId: string,
) {
  const response = await fetch(
    `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notifications-dispatcher`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ userId, jobIds: [jobId] }),
      signal: AbortSignal.timeout(60000),
    },
  )
  if (!response.ok) throw new Error(`Dispatcher returned ${response.status}`)
}

async function testVoice() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    setRequestUser(user)

    const { data: rateAllowed, error: rateError } = await supabase.rpc(
      'consume_api_rate_limit',
      {
        requested_endpoint: RATE_LIMIT_ENDPOINT,
        request_limit: RATE_LIMIT_REQUESTS,
        window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )
    if (rateError) throw rateError
    if (!rateAllowed) {
      return NextResponse.json(
        {
          error:
            'Please wait a few minutes before requesting another test call.',
        },
        {
          status: 429,
          headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) },
        },
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from(TABLES.PROFILES)
      .select('phone, voice_call_enabled')
      .eq('user_id', user.id)
      .single()

    if (profileError) throw profileError
    if (!profile?.voice_call_enabled || !profile.phone) {
      return NextResponse.json(
        { error: 'Enable Voice Reminders and set your phone number first.' },
        { status: 400 },
      )
    }

    const adminEnv = getSupabaseAdminEnv()
    const admin = createAdminClient()

    const jobId = randomUUID()
    const { error: insertError } = await admin
      .from(TABLES.NOTIFICATION_JOBS)
      .insert({
        id: jobId,
        user_id: user.id,
        business_id: null,
        channel: 'voice',
        purpose: 'sample_voice_test',
        payload: {},
        scheduled_at: new Date().toISOString(),
        idempotency_key: `sample_voice_test:${user.id}:${jobId}`,
      })

    if (insertError) throw insertError

    // The committed job remains claimable by the scheduled dispatcher, so a
    // failed immediate dispatch is reported but the job's state decides the response.
    await dispatchNow(adminEnv.SUPABASE_SERVICE_ROLE_KEY, user.id, jobId).catch(
      (error) =>
        logger.error('Immediate test voice dispatch failed', error, { jobId }),
    )

    const { data: job, error: jobError } = await admin
      .from(TABLES.NOTIFICATION_JOBS)
      .select('status, last_error')
      .eq('id', jobId)
      .single()

    if (jobError) throw jobError

    if (job.status === 'sent') {
      return NextResponse.json({ success: true })
    }

    if (job.last_error === QUOTA_EXHAUSTED_ERROR) {
      return NextResponse.json(
        {
          error: "You've used all your Voice Reminder calls for this period.",
        },
        { status: 403 },
      )
    }

    if (job.status === 'pending' || job.status === 'processing') {
      return NextResponse.json({
        success: true,
        queued: true,
      })
    }

    return NextResponse.json(
      { error: job.last_error || 'Could not place the test call.' },
      { status: 502 },
    )
  } catch (error) {
    logger.error('Failed to trigger test voice call', error)
    return NextResponse.json(
      { error: 'Unable to trigger test call' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'notification.test_voice', testVoice)
}
