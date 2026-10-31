import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { exportJobService } from '../services/export-job.service'

export function useExportJobs(businessId: string | undefined) {
  const client = useQueryClient()
  const { profile } = useProfile()
  const pending = useRef<{
    id: string
    businessId: string
    format: 'csv' | 'json'
    includeInward: boolean
  } | null>(null)
  const key = queryKeys.reportExports.list(businessId)
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const jobs = await exportJobService.list(businessId!)
      const now = Date.now()
      return jobs.map((job) =>
        new Date(job.expires_at).getTime() <= now
          ? { ...job, status: 'expired' as const }
          : job,
      )
    },
    enabled: !!businessId,
    refetchInterval: (query) =>
      query.state.data?.some(
        (job) => job.status === 'queued' || job.status === 'processing',
      )
        ? 5000
        : 30000,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Export jobs could not be loaded', query.error)
  }, [query.error])
  return {
    ...query,
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
