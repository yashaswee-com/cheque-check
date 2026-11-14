import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isRecord, OCR_MAX_IMAGE_BYTES } from './contract.ts'
import { openAiExtraction, runScan, type ScanClaim } from './worker.ts'

serve(async (request) => {
  const started = Date.now()
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const aiKey = Deno.env.get('OPENAI_API_KEY')
  if (!url || !key || !aiKey)
    return new Response('OCR worker not configured', { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${key}`)
    return new Response(null, { status: 401 })
  try {
    const body: unknown = await request.json()
    if (
      !isRecord(body) ||
      typeof body.job_id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.job_id)
    )
      return new Response(null, { status: 400 })
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(2000) }),
      },
    })
    await runScan(body.job_id, {
      now: Date.now,
      async active(job) {
        const { data, error } = await client.rpc('continue_cheque_scan', {
          requested_job: job.id,
          requested_token: job.claim_token,
        })
        if (error) throw new Error('CLAIM_UNAVAILABLE')
        return data === true
      },
      async claim(id) {
        const { data, error } = await client.rpc('claim_cheque_scan', {
          requested_job: id,
        })
        if (error) throw new Error('CLAIM_FAILED')
        if (data === null) return null
        if (
          !isRecord(data) ||
          typeof data.id !== 'string' ||
          typeof data.image_url !== 'string' ||
          typeof data.claim_token !== 'string' ||
          typeof data.deadline_at !== 'string' ||
          !Number.isFinite(Date.parse(data.deadline_at)) ||
          typeof data.model !== 'string'
        )
          throw new Error('INVALID_CLAIM')
        return {
          id: data.id,
          image_url: data.image_url,
          claim_token: data.claim_token,
          deadline_at: data.deadline_at,
          model: data.model,
          auto_charge_enabled: data.auto_charge_enabled === true,
        }
      },
      async image(job, signal) {
        const prefix = '/api/storage/private-cheque-images/'
        if (!job.image_url.startsWith(prefix)) throw new Error('INVALID_IMAGE')
        const segments = job.image_url
          .slice(prefix.length)
          .split('/')
          .map(decodeURIComponent)
        if (
          segments.some(
            (part) =>
              !part || part === '.' || part === '..' || part.includes('/'),
          )
        )
          throw new Error('INVALID_IMAGE')
        // Fetch only the fixed private storage endpoint with server authorization, never a document-supplied URL.
        const response = await fetch(
          `${url}/storage/v1/object/authenticated/private-cheque-images/${segments.map(encodeURIComponent).join('/')}`,
          {
            signal,
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          },
        )
        if (!response.ok) throw new Error('IMAGE_NOT_FOUND')
        const declared = Number(response.headers.get('Content-Length'))
        if (declared > OCR_MAX_IMAGE_BYTES || !response.body)
          throw new Error('INVALID_IMAGE')
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let length = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.length
            if (length > OCR_MAX_IMAGE_BYTES) throw new Error('INVALID_IMAGE')
            chunks.push(value)
          }
        } finally {
          await reader.cancel()
        }
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
        }
        return bytes
      },
      infer: (job, bytes, mediaType, signal) =>
        openAiExtraction(aiKey, job, bytes, mediaType, signal),
      async finish(job, result) {
        const { data, error } = await client.rpc('finish_cheque_scan', {
          requested_job: job.id,
          requested_token: job.claim_token,
          requested_status: result.status,
          requested_details: result.details ?? null,
          requested_reliability: result.reliability ?? null,
          requested_error: result.error ?? null,
        })
        if (error) throw new Error('SETTLEMENT_FAILED')
        console.info(
          JSON.stringify({
            event: 'ocr.scan.settled',
            duration_ms: Date.now() - started,
            status: isRecord(data) ? data.status : 'unknown',
            credit_state: isRecord(data) ? data.credit_state : 'unknown',
          }),
        )
      },
    })
    return Response.json({ accepted: true })
  } catch {
    // Content-free operational event; database expiry reconciles interrupted jobs.
    console.error('cheque_ocr_worker_failed')
    return new Response('OCR worker failed', { status: 500 })
  }
})
