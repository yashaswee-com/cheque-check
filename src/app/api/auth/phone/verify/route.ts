import { createClient } from '@/lib/supabase/server'
import { withMonitoringRequest } from '@/lib/monitoring/server'
import { verifyPhoneOtp } from '@/features/auth/server/phone-auth'
import {
  phoneAuthResponse,
  readJsonBody,
} from '@/features/auth/server/phone-auth-response'

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'auth.phone_verify', async () => {
    const supabase = await createClient()
    const result = await verifyPhoneOtp(supabase, await readJsonBody(request))
    return phoneAuthResponse(result, 'auth.phone_verify')
  })
}
