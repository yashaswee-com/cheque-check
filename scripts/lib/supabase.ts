import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'
import { OpsError, UsageError } from './errors'

export type AdminClient = SupabaseClient<Database>

export interface SupabaseCredentials {
  url: string
  serviceRoleKey: string
}

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const

export function createAdminClient(credentials: SupabaseCredentials) {
  return createClient<Database>(
    credentials.url,
    credentials.serviceRoleKey,
    CLIENT_OPTIONS,
  )
}

export function createAnonClient(url: string, anonKey: string) {
  return createClient<Database>(url, anonKey, CLIENT_OPTIONS)
}

export const EDGE_FUNCTIONS = [
  'notifications-scheduler',
  'notifications-dispatcher',
  'razorpay-webhook',
  'report-exports',
  'marketing-delivery',
] as const
export type EdgeFunctionName = (typeof EDGE_FUNCTIONS)[number]

export interface FunctionResponse<T> {
  status: number
  body: T
}

function functionError(name: string, status: number, body: unknown): OpsError {
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${status}`
  switch (status) {
    case 400:
      return new UsageError(`${name} rejected the request: ${detail}`)
    case 401:
    case 403:
      return new OpsError(`${name} returned ${status}: ${detail}`, {
        hint: 'SUPABASE_SERVICE_ROLE_KEY must match the project the function is deployed to.',
      })
    case 404:
      return new OpsError(`${name} is not deployed to this project.`, {
        hint: 'Deploy it with `npm run supabase:functions:deploy`.',
      })
    case 503:
      return new OpsError(`${name} is not fully configured: ${detail}`, {
        hint: 'Check the function secrets (e.g. TWILIO_*) with `npx supabase secrets list`.',
      })
    default:
      return new OpsError(`${name} failed with ${status}: ${detail}`, {
        hint: 'See the function logs in the Supabase dashboard.',
      })
  }
}

/** POSTs to an edge function with the service-role key; non-2xx responses become OpsErrors. */
export async function invokeFunction<T>(
  credentials: SupabaseCredentials,
  name: EdgeFunctionName,
  body: unknown = {},
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<FunctionResponse<T>> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${credentials.url}/functions/v1/${name}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.serviceRoleKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    })
  } catch (error) {
    throw new OpsError(`Could not reach ${name} at ${url}.`, {
      hint: 'Check NEXT_PUBLIC_SUPABASE_URL and that the function is deployed (or `npx supabase functions serve` locally).',
      cause: error,
    })
  }

  const parsed = (await response.json().catch(() => null)) as T
  if (!response.ok) throw functionError(name, response.status, parsed)
  return { status: response.status, body: parsed }
}

/**
 * Checks a function is deployed without running it: functions reject GET
 * with 405, while an undeployed function returns 404.
 */
export async function probeFunction(
  credentials: SupabaseCredentials,
  name: EdgeFunctionName,
  fetchImpl: typeof fetch = fetch,
): Promise<{ deployed: boolean; status: number | null }> {
  try {
    const response = await fetchImpl(
      `${credentials.url}/functions/v1/${name}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.serviceRoleKey}` },
        signal: AbortSignal.timeout(15_000),
      },
    )
    await response.body?.cancel()
    return { deployed: response.status !== 404, status: response.status }
  } catch {
    return { deployed: false, status: null }
  }
}
