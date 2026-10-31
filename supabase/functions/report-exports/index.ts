import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Logger } from '../_shared/logger.ts'
import { runExportWorker, parseExportJobs, parseExportRows } from './worker.ts'

serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key)
    return new Response('Worker not configured', { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${key}`)
    return new Response(null, { status: 401 })
  const started = Date.now()
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    })
    async function rpc(name: string, args = {}): Promise<unknown> {
      const { data, error } = await client.rpc(name, args)
      if (error) throw error
      return data
    }
    const bucket = client.storage.from('report-exports')
    const result = await runExportWorker(
      {
        async claim() {
          const jobs = parseExportJobs(await rpc('claim_report_export'))
          if (jobs.length > 1) throw new Error('Invalid export claim count')
          return jobs[0] ?? null
        },
        batch: async (job) =>
          parseExportRows(
            await rpc('report_export_batch', {
              requested_job: job.id,
              requested_token: job.claim_token,
            }),
          ),
        advance: async (job) =>
          parseExportJobs([
            await rpc('advance_report_export', {
              requested_job: job.id,
              requested_token: job.claim_token,
              requested_part: job.next_part,
            }),
          ])[0],
        release: async (job, failed) => {
          await rpc('release_report_export', {
            requested_job: job.id,
            requested_token: job.claim_token,
            requested_failed: failed,
          })
        },
        expired: async () =>
          parseExportJobs(await rpc('expired_report_exports')),
        cleaned: async (job) => {
          await rpc('clean_report_export', { requested_job: job.id })
        },
      },
      {
        async upload(path, content) {
          const { error } = await bucket.upload(
            path,
            new TextEncoder().encode(content),
            { upsert: true, contentType: 'application/octet-stream' },
          )
          if (error) throw error
        },
        async removeJob(prefix) {
          const listed = await bucket.list(prefix, {
            limit: 100,
            sortBy: { column: 'name', order: 'asc' },
          })
          if (listed.error) throw listed.error
          if (listed.data.length) {
            const removed = await bucket.remove(
              listed.data.map((item) => `${prefix}/${item.name}`),
            )
            if (removed.error) throw removed.error
          }
          const remaining = await bucket.list(prefix, { limit: 1 })
          if (remaining.error) throw remaining.error
          if (remaining.data.length)
            throw new Error('Export cleanup incomplete')
        },
      },
    )
    Logger.metric('report.export.worker', {
      ...result,
      duration_ms: Date.now() - started,
    })
    return Response.json(result)
  } catch (error) {
    Logger.error(
      'Export worker failed',
      error instanceof Error ? error.name : 'Database or storage error',
    )
    return new Response('Export generation failed', { status: 500 })
  }
})
