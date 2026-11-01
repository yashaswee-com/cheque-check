import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { exportJobService } from '../services/export-job.service'
import type { ExportJobPageRequest } from '@/validators/export-job'

export function useExportJobs(
  businessId: string | undefined,
  page?: ExportJobPageRequest,
) {
  const client = useQueryClient()
  const { profile } = useProfile()
  const pending = useRef<{
    id: string
    businessId: string
    format: 'csv' | 'json'
    includeInward: boolean
  } | null>(null)
  const key = queryKeys.reportExports.list(businessId)
  const [visible, setVisible] = useState(
    () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const query = useQuery({
    queryKey: page ? queryKeys.reportExports.page(businessId, page) : key,
    queryFn: async () => {
      const result = page
        ? await exportJobService.listPage(businessId!, page)
        : { jobs: await exportJobService.list(businessId!), total: undefined }
      const now = Date.now()
      return {
        ...result,
        jobs: result.jobs.map((job) =>
          new Date(job.expires_at).getTime() <= now
            ? { ...job, status: 'expired' as const }
            : job,
        ),
      }
    },
    enabled: !!businessId && visible,
    refetchInterval: (query) =>
      visible &&
      query.state.data?.jobs.some(
        (job) => job.status === 'queued' || job.status === 'processing',
      )
        ? 5000
        : false,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Export jobs could not be loaded', query.error)
  }, [query.error])
  return {
    ...query,
    data: query.data?.jobs,
    matchingCount: query.data?.total,
    async request(format: 'csv' | 'json') {
      if (!businessId) throw new Error('Select a business before exporting')
      const includeInward = profile?.received_cheques_enabled !== false
      if (
        !pending.current ||
        pending.current.businessId !== businessId ||
        pending.current.format !== format ||
        pending.current.includeInward !== includeInward
      )
        pending.current = {
          id: crypto.randomUUID(),
          businessId,
          format,
          includeInward,
        }
      await exportJobService.request(
        pending.current.id,
        businessId,
        format,
        includeInward,
      )
      pending.current = null
      await client.invalidateQueries({ queryKey: key })
    },
    async cancel(id: string) {
      await exportJobService.cancel(id)
      await client.invalidateQueries({ queryKey: key })
    },
  }
}
