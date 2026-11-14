import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { ScanActionSchema } from '@/validators/cheque-scan'
import { TABLES } from '@/lib/supabase/tables'

export const maxDuration = 10

const errors: Record<string, { status: number; message: string }> = {
  AI_SCAN_DISABLED: { status: 403, message: 'AI Scan Mode is disabled.' },
  CONSENT_REQUIRED: {
    status: 403,
    message: 'Review and acknowledge AI processing before scanning.',
  },
  QUOTA_EXHAUSTED: { status: 402, message: 'No scan credits are available.' },
  SCAN_BUSY: {
    status: 429,
    message: 'Scanning is busy. Please retry shortly.',
  },
  SCAN_DISABLED: {
    status: 503,
    message:
      'AI scanning is temporarily unavailable. Manual entry is available.',
  },
  IMAGE_NOT_FOUND: {
    status: 404,
    message: 'The uploaded cheque is no longer available.',
  },
  DUPLICATE_ENTITY: {
    status: 409,
    message: 'A similar record exists. Review it before creating another.',
  },
  REVIEW_EXPIRED: { status: 409, message: 'This scan review has expired.' },
  SCAN_NOT_READY: { status: 409, message: 'This scan cannot be accepted.' },
  CONTACT_REQUIRED: { status: 400, message: 'Enter a valid contact number.' },
}

async function handle(request: Request): Promise<Response> {
  try {
    const reader = request.body?.getReader()
    let text = ''
    let size = 0
    const decoder = new TextDecoder()
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 8192)
            return Response.json({ code: 'INVALID_REQUEST' }, { status: 413 })
          text += decoder.decode(value, { stream: true })
        }
        text += decoder.decode()
      } finally {
        await reader.cancel()
      }
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 })
    }
    const parsed = ScanActionSchema.safeParse(body)
    if (!parsed.success)
      return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 })
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user)
      return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    setRequestUser(user)
    const action = parsed.data
    const { data: profile, error: profileError } = await supabase
      .from(TABLES.PROFILES)
      .select('ai_scan_enabled')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (profileError) throw new Error('PROFILE_UNAVAILABLE')
    if (!profile) return Response.json({ code: 'FORBIDDEN' }, { status: 403 })
    if (action.action === 'start' && !profile.ai_scan_enabled) {
      return Response.json(
        { code: 'AI_SCAN_DISABLED', error: errors.AI_SCAN_DISABLED.message },
        { status: 403 },
      )
    }
    if (action.action === 'start' || action.action === 'create') {
      const { data, error } = await supabase.rpc('consume_api_rate_limit', {
        requested_endpoint: 'ocr-cheque',
        request_limit: 10,
        window_seconds: 60,
      })
      if (error) throw new Error('RATE_LIMIT_UNAVAILABLE')
      if (!data)
        return Response.json(
          { code: 'SCAN_BUSY', error: errors.SCAN_BUSY.message },
          {
            status: 429,
            headers: { 'Retry-After': '60' },
          },
        )
    }
    const result = await (async () => {
      switch (action.action) {
        case 'start':
          return supabase.rpc('begin_cheque_scan', {
            requested_image: action.imageUrl,
            requested_key: action.key,
            requested_consent: action.consent,
            requested_mode: action.mode,
          })
        case 'read':
          return supabase.rpc('read_cheque_scan', {
            requested_image: action.imageUrl,
          })
        case 'consent':
          return supabase.rpc('acknowledge_cheque_scan_consent', {
            requested_version: action.version,
          })
        case 'accept':
        case 'cancel':
          return supabase.rpc('mutate_cheque_scan', {
            requested_job: action.jobId,
            requested_action: action.action,
          })
        case 'candidates':
          return supabase.rpc('scan_entity_candidates', {
            requested_job: action.jobId,
          })
        case 'confirm-party':
          return supabase.rpc('confirm_scan_party', {
            requested_job: action.jobId,
            requested_party: action.partyId,
          })
        case 'remap':
          return supabase.rpc('remap_cheque_scan', {
            requested_job: action.jobId,
            requested_mode: action.mode,
          })
        case 'confirm-duplicate':
          return supabase.rpc('confirm_scan_duplicate', {
            requested_job: action.jobId,
            requested_account: action.accountId,
            requested_number: action.chequeNumber,
          })
        case 'create':
          return supabase.rpc('create_scan_entity', {
            requested_job: action.jobId,
            requested_kind: action.kind,
            requested_bank: action.bankId ?? undefined,
            requested_contact: action.contact ?? undefined,
            requested_allow_duplicate: action.allowDuplicate,
          })
      }
    })()
    if (result.error) {
      const safe = Object.keys(errors).find(
        (code) => result.error.message === code,
      )
      if (safe)
        return Response.json(
          { code: safe, error: errors[safe].message },
          {
            status: errors[safe].status,
            headers: safe === 'SCAN_BUSY' ? { 'Retry-After': '5' } : {},
          },
        )
      if (result.error.code === '42501')
        return Response.json({ code: 'FORBIDDEN' }, { status: 403 })
      throw new Error('SCAN_DATABASE_UNAVAILABLE')
    }
    return Response.json(
      { data: result.data },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    // Database/provider exceptions can contain extracted content; log only the operation.
    logger.error('ocr.request.failed')
    return Response.json(
      {
        code: 'SCAN_UNAVAILABLE',
        error: 'Scanning is unavailable. Retry or enter details manually.',
      },
      { status: 503 },
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  return withMonitoringRequest(request, 'ocr.scan', () => handle(request))
}
