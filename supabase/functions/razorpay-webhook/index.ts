import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleRazorpayWebhook } from './handler.ts'

serve((request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  const client =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null
  return handleRazorpayWebhook(
    request,
    secret,
    client ? (name, args) => client.rpc(name, args) : null,
  )
})
