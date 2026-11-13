import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  deliverMetaEvent,
  resolveDeliveryConfig,
  parseDeliveryClaim,
  accountMatching,
  type MetaResult,
} from './delivery.ts'

async function equalSecret(left: string, right: string) {
  const encode = new TextEncoder()
  const [a, b] = await Promise.all(
    [left, right].map((s) => crypto.subtle.digest('SHA-256', encode.encode(s))),
  )
  return (
    new Uint8Array(a).reduce(
      (diff, byte, i) => diff | (byte ^ new Uint8Array(b)[i]),
      0,
    ) === 0
  )
}

Deno.serve(async (request: Request) => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  if (!key || !url)
    return Response.json(
      { error: 'Worker configuration missing' },
      { status: 503 },
    )
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (
    !(await equalSecret(
      request.headers.get('authorization') ?? '',
      `Bearer ${key}`,
    ))
  )
    return new Response(null, { status: 401 })
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const maintenance = await db.rpc('marketing_maintenance')
    if (maintenance.error) throw new Error('Marketing maintenance failed')
    if (Deno.env.get('MARKETING_DELIVERY_ENABLED') !== 'true')
      return Response.json({ enabled: false })
    const config = resolveDeliveryConfig((key) => Deno.env.get(key))
    const { data, error } = await db.rpc('marketing_claim_delivery', {
      batch_size: 25,
    })
    if (error) throw new Error('Marketing queue claim failed')
    const raw: unknown = data
    if (!Array.isArray(raw)) throw new Error('Invalid marketing queue response')
    const events = raw.map(parseDeliveryClaim)
    let delivered = 0
    const results = await Promise.allSettled(
      (events ?? []).map(async (event) => {
        if (event.mode !== config.mode)
          throw new Error('Marketing environment mode mismatch')
        const source = event.payload?.event_source_url
        if (
          typeof source !== 'string' ||
          !URL.canParse(source) ||
          new URL(source).origin !== config.siteOrigin
        )
          throw new Error('Marketing event source configuration mismatch')
        let matchingUnavailable = false
        if (
          event.owner &&
          event.payload.user_data &&
          typeof event.payload.user_data === 'object' &&
          Object.keys(event.payload.user_data).length === 0
        ) {
          const account = await db.auth.admin.getUserById(event.owner)
          if (account.error || !account.data.user) matchingUnavailable = true
          else
            event.payload.user_data = await accountMatching(account.data.user)
        }
        const valid = await db.rpc('marketing_delivery_valid', {
          event: event.event_id,
          token: event.lease_token,
        })
        if (valid.error) throw new Error('Marketing consent recheck failed')
        if (!valid.data) return
        const result: MetaResult = matchingUnavailable
          ? { outcome: 'retry', code: 'account_matching_unavailable' }
          : await deliverMetaEvent(event.payload, config)
        const settled = await db.rpc('marketing_settle_delivery', {
          event: event.event_id,
          token: event.lease_token,
          outcome: result.outcome,
          result_code: result.code,
        })
        if (settled.error) throw new Error('Marketing queue settlement failed')
        if (result.outcome === 'delivered') delivered++
      }),
    )
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Marketing batch has unsettled deliveries')
    return Response.json({ processed: events?.length ?? 0, delivered })
  } catch (error) {
    // Never log provider responses, tokens, matching data, or event payloads.
    console.error(
      error instanceof Error ? error.message : 'Marketing worker failed',
    )
    return Response.json({ error: 'Marketing worker failed' }, { status: 503 })
  }
})
