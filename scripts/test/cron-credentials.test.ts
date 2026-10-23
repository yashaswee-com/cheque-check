import { describe, expect, it, vi } from 'vitest'
import { provisionCronCredentials } from '../lib/cron-credentials'

describe('provisionCronCredentials', () => {
  it('calls the service-role RPC with the named arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await provisionCronCredentials({ rpc }, 'https://abc.supabase.co', 'key')
    expect(rpc).toHaveBeenCalledWith('configure_cron_credentials', {
      requested_project_url: 'https://abc.supabase.co',
      requested_service_role_key: 'key',
    })
  })

  it('throws without echoing the key on RPC failure', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'denied' } })
    await expect(
      provisionCronCredentials({ rpc }, 'https://abc.supabase.co', 'secret-k'),
    ).rejects.toThrow(/denied/)
  })
})
