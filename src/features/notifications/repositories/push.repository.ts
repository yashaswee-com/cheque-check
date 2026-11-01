import { createClient } from '@/lib/supabase/client'
import {
  unwrapSupabaseResult,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import { pushSubscriptionSchema } from '@/validators/push-subscription'
import { ValidationError, DatabaseError } from '@/lib/errors'

export const pushRepository = {
  async register(subscription: PushSubscriptionJSON) {
    const parsed = pushSubscriptionSchema.safeParse(subscription)
    if (!parsed.success)
      throw new ValidationError('Invalid browser push subscription')
    return unwrapSupabaseResult(
      await createClient().rpc('register_push_subscription', {
        requested_endpoint: parsed.data.endpoint,
        requested_p256dh: parsed.data.keys.p256dh,
        requested_auth: parsed.data.keys.auth,
      }),
    )
  },
  async owns(endpoint: string) {
    const result = unwrapSupabaseResult(
      await createClient().rpc('owns_push_subscription', {
        requested_endpoint: endpoint,
      }),
    )
    if (typeof result !== 'boolean')
      throw new DatabaseError('Invalid push subscription state')
    return result
  },
  async remove(endpoint: string) {
    unwrapSupabaseVoid(
      await createClient().rpc('remove_push_subscription', {
        requested_endpoint: endpoint,
      }),
    )
  },
}
