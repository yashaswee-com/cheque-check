import { createClient } from '@/lib/supabase/client'
import { TABLES } from '@/lib/supabase/tables'
import {
  parseDatabaseValue,
  unwrapSupabaseResult,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import { exportJobListSchema } from '@/validators/export-job'
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
