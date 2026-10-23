import { createAdminClient } from './supabase'

interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ error: { message: string } | null }>
}

/** Stores the pg_cron credentials in Vault through the service-role-only RPC. */
export async function provisionCronCredentials(
  client: RpcClient,
  url: string,
  serviceRoleKey: string,
): Promise<void> {
  const { error } = await client.rpc('configure_cron_credentials', {
    requested_project_url: url,
    requested_service_role_key: serviceRoleKey,
  })
  if (error)
    throw new Error(`configure_cron_credentials failed: ${error.message}`)
}

export function createCronCredentialsClient(
  url: string,
  serviceRoleKey: string,
): RpcClient {
  return createAdminClient({ url, serviceRoleKey }) as unknown as RpcClient
}
