import { exportJobRepository } from '../repositories/export-job.repository'
import { monitorOperation } from '@/lib/monitoring/telemetry'

export const exportJobService = {
  list: (businessId: string) =>
    monitorOperation('report.jobs.list', () =>
      exportJobRepository.list(businessId),
    ),
  request: (
    id: string,
    businessId: string,
    format: 'csv' | 'json',
    includeInward: boolean,
  ) =>
    monitorOperation('report.jobs.request', () =>
      exportJobRepository.request(id, businessId, format, includeInward),
    ),
  cancel: (id: string) =>
    monitorOperation('report.jobs.cancel', () =>
      exportJobRepository.cancel(id),
    ),
}
