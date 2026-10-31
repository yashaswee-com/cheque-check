import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { exportJobSchema } from '@/validators/export-job'
import { PRIVATE_REPORT_EXPORT_BUCKET } from '@/lib/storage'

export const maxDuration = 300

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return Response.json(
      { error: 'Invalid export identifier' },
      { status: 400 },
    )
  const client = await createClient()
  const auth = await client.auth.getUser()
  if (auth.error || !auth.data.user)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await client.rpc('report_export_download', {
    requested_job: id,
  })
  if (error || !data) {
    if (error && error.code !== '42501')
      logger.error('Export download authorization failed', error)
    return Response.json(
      { error: 'Export unavailable or expired' },
      { status: error?.code === '42501' ? 403 : 500 },
    )
  }
  const parsed = exportJobSchema.safeParse(data)
  if (!parsed.success || parsed.data.status !== 'ready') {
    logger.error(
      'Invalid export download metadata',
      parsed.success ? undefined : parsed.error,
    )
    return Response.json({ error: 'Invalid export metadata' }, { status: 500 })
  }
  const job = parsed.data
  let part = 0
  let cancelled = false
  let reader: ReadableStreamDefaultReader<unknown> | null = null
  const abort = new AbortController()
  const deadline = AbortSignal.timeout(290000)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (!reader) {
            if (part >= job.part_count) {
              controller.close()
              return
            }
            // Authenticated Storage RLS rechecks access for each part; never buffer the entire file.
            const result = await client.storage
              .from(PRIVATE_REPORT_EXPORT_BUCKET)
              .download(
                `${job.user_id}/${job.id}/${part}.part`,
                {},
                {
                  cache: 'no-store',
                  signal: AbortSignal.any([
                    request.signal,
                    abort.signal,
                    deadline,
                    AbortSignal.timeout(60000),
                  ]),
                },
              )
              .asStream()
            if (result.error || !result.data)
              throw result.error ?? new Error('Export part missing')
            if (cancelled) {
              await result.data.cancel()
              return
            }
            reader = result.data.getReader()
          }
          const { value, done } = await reader.read()
          if (cancelled) return
          if (done) {
            reader.releaseLock()
            reader = null
            part++
            continue
          }
          if (!(value instanceof Uint8Array))
            throw new Error('Invalid export stream chunk')
          controller.enqueue(value)
          return
        }
      } catch (error) {
        if (!cancelled) {
          logger.error('Export download stream failed', error)
          abort.abort(error)
          controller.error(error)
        }
      }
    },
    async cancel(reason) {
      cancelled = true
      abort.abort(reason)
      await reader?.cancel(reason)
      reader?.releaseLock()
      reader = null
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type':
        job.format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="cheques-${job.id}.${job.format}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
