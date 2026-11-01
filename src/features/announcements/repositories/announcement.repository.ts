import { createClient } from '@/lib/supabase/client'
import {
  parseDatabaseValue,
  unwrapSupabaseVoid,
} from '@/repositories/base.repository'
import { announcementSchema } from '@/validators/announcement'
export const announcementRepository = {
  async latest() {
    const result = await createClient().rpc('latest_developer_message')
    if (result.error) throw result.error
    return parseDatabaseValue(
      result.data,
      announcementSchema,
      'developer message',
    )
  },
  async acknowledge(id: string) {
    unwrapSupabaseVoid(
      await createClient().rpc('acknowledge_developer_message', {
        requested_id: id,
      }),
    )
  },
}
