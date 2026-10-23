import { createClient } from '@/lib/supabase/server'
import { withMonitoringRequest } from '@/lib/monitoring/server'
import { sendPhoneOtp } from '@/features/auth/server/phone-auth'
import {
  phoneAuthResponse,
  readJsonBody,
} from '@/features/auth/server/phone-auth-response'

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'auth.phone_send', async () => {
    const supabase = await createClient()
    const result = await sendPhoneOtp(supabase, await readJsonBody(request))
    return phoneAuthResponse(result, 'auth.phone_send')
  })
}
