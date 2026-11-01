import { monitorOperation } from '@/lib/monitoring/telemetry'
import {
  analyticsRepository,
  type AnalyticsRequest,
} from '../repositories/analytics.repository'

export const analyticsService = {
  get: (request: AnalyticsRequest) =>
    monitorOperation('cheques.analytics', () =>
      analyticsRepository.get(request),
    ),
}
