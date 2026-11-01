import { createClient } from '@/lib/supabase/client'
import { TABLES } from '@/lib/supabase/tables'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import {
  exportJobListSchema,
  exportJobPageRequestSchema,
  type ExportJobPageRequest,
} from '@/validators/export-job'
import { DatabaseError, ValidationError } from '@/lib/errors'
import type { Database } from '@/types/database.types'

type Job = Database['public']['Tables']['report_export_jobs']['Row']
export type ExportJob = Pick<
  Job,
  | 'id'
  | 'format'
  | 'status'
  | 'row_count'
  | 'next_part'
  | 'part_count'
  | 'created_at'
  | 'expires_at'
  | 'error_code'
>
const columns =
  'id,format,status,row_count,next_part,part_count,created_at,expires_at,error_code'

export const exportJobRepository = {
  async listPage(businessId: string, request: ExportJobPageRequest) {
    const parsed = exportJobPageRequestSchema.safeParse(request)
    if (!parsed.success)
      throw new ValidationError('Invalid export job page request')
    let query = createClient()
      .from(TABLES.REPORT_EXPORT_JOBS)
      .select(columns, { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(request.offset, request.offset + request.limit - 1)
    if (request.format) query = query.eq('format', request.format)
    const now = new Date().toISOString()
    if (request.status === 'expired') query = query.lte('expires_at', now)
    else if (request.status)
      query = query.eq('status', request.status).gt('expires_at', now)
    const result = await query
    const jobs = parseDatabaseValue(
      unwrapSupabaseResult(result),
      exportJobListSchema,
      'export jobs',
    )
    if (result.count === null)
      throw new DatabaseError('Export job count was not returned')
    return { jobs, total: result.count }
  },
  async list(businessId: string): Promise<ExportJob[]> {
    return parseDatabaseValue(
      unwrapSupabaseResult(
        await createClient()
          .from(TABLES.REPORT_EXPORT_JOBS)
          .select(columns)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(10),
      ),
      exportJobListSchema,
      'export jobs',
    )
  },
  async request(
    id: string,
    businessId: string,
    format: 'csv' | 'json',
    includeInward: boolean,
  ): Promise<void> {
    unwrapSupabaseResult(
      await createClient().rpc('request_report_export', {
        requested_id: id,
        requested_business: businessId,
        requested_format: format,
        requested_include_inward: includeInward,
      }),
    )
  },
  async cancel(id: string): Promise<void> {
    unwrapSupabaseVoid(
      await createClient().rpc('cancel_report_export', { requested_job: id }),
    )
  },
}
