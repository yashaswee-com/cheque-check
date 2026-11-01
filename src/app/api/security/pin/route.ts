import { handleSecurity } from '@/features/security/server/handler'
import { withMonitoringRequest } from '@/lib/monitoring/server'
export const runtime = 'nodejs'
export function GET(request: Request) {
  return withMonitoringRequest(request, 'security.pin_status', () =>
    handleSecurity(request),
  )
}
export function POST(request: Request) {
  return withMonitoringRequest(request, 'security.pin_action', () =>
    handleSecurity(request),
  )
}
