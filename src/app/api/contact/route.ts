import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseAdminEnv } from '@/lib/env/server'
import { logger } from '@/lib/logger'
import { withMonitoringRequest } from '@/lib/monitoring/server'
import { contactMessageSchema } from '@/validators/contact'

const MAX_BODY_BYTES = 8192

async function readRequestBody(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
    return null

  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    return null
  }
}

function getClientIp(request: Request) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim()
  const candidates = [
    request.headers.get('x-real-ip')?.trim(),
    request.headers.get('cf-connecting-ip')?.trim(),
    forwarded,
  ]
  return candidates.find((candidate) => candidate && isIP(candidate)) ?? null
}

function hashClientIp(ip: string) {
  return createHmac('sha256', getSupabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY)
    .update(ip)
    .digest('hex')
}

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'public.contact_submit', async () => {
    const body = await readRequestBody(request)
    const parsed = contactMessageSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: 'invalid_message' }, { status: 400 })

    const ip = getClientIp(request)
    if (!ip)
      return NextResponse.json(
        { error: 'client_address_unavailable' },
        { status: 503 },
      )

    try {
      const admin = createAdminClient()
      const { data: accepted, error } = await admin.rpc(
        'submit_contact_message',
        {
          requested_name: parsed.data.name,
          requested_email: parsed.data.email,
          requested_message: parsed.data.message,
          requested_address_hash: hashClientIp(ip),
          request_limit: 3,
          window_seconds: 3600,
        },
      )
      if (error) throw error
      if (!accepted) {
        return NextResponse.json(
          { error: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': '3600' } },
        )
      }
      return NextResponse.json({ received: true }, { status: 201 })
    } catch (error) {
      logger.error('Private contact submission could not be stored', error)
      return NextResponse.json(
        { error: 'submission_unavailable' },
        { status: 503 },
      )
    }
  })
}
