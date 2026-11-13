export type MetaResult = {
  outcome: 'delivered' | 'failed' | 'retry'
  code: string
}
export type DeliveryConfig = {
  pixelId: string
  accessToken: string
  apiVersion: string
  mode: 'live' | 'test'
  testCode?: string
}
export function parseDeliveryClaim(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('event_id' in value) ||
    typeof value.event_id !== 'string' ||
    !('lease_token' in value) ||
    typeof value.lease_token !== 'string' ||
    !('mode' in value) ||
    !['live', 'test'].includes(String(value.mode)) ||
    !('payload' in value) ||
    !value.payload ||
    typeof value.payload !== 'object' ||
    Array.isArray(value.payload) ||
    !('owner' in value) ||
    (value.owner !== null && typeof value.owner !== 'string')
  )
    throw new Error('Invalid marketing claim')
  const payload: Record<string, unknown> = { ...value.payload }
  return {
    event_id: value.event_id,
    lease_token: value.lease_token,
    mode: value.mode,
    owner: value.owner,
    payload,
  }
}

export async function accountMatching(user: {
  id: string
  email?: string
  phone?: string
  email_confirmed_at?: string
  phone_confirmed_at?: string
}) {
  const hash = async (value: string) => {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value),
    )
    return [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
  const data: Record<string, string[]> = { external_id: [await hash(user.id)] }
  if (user.email && user.email_confirmed_at)
    data.em = [await hash(user.email.trim().toLowerCase())]
  if (user.phone && user.phone_confirmed_at)
    data.ph = [await hash(user.phone.replace(/\D/g, ''))]
  return data
}

export function resolveDeliveryConfig(
  read: (key: string) => string | undefined,
): DeliveryConfig & { siteOrigin: string } {
  const mode = read('MARKETING_DELIVERY_MODE')
  const pixelId = read('META_PIXEL_ID')
  const accessToken = read('META_CAPI_ACCESS_TOKEN')
  const apiVersion = read('META_GRAPH_API_VERSION')
  const testCode = read('META_TEST_EVENT_CODE')
  const siteOrigin = read('MARKETING_SITE_ORIGIN')
  if (
    !pixelId ||
    !/^\d+$/.test(pixelId) ||
    !accessToken ||
    !apiVersion ||
    !/^v\d+\.\d+$/.test(apiVersion) ||
    !siteOrigin ||
    !URL.canParse(siteOrigin) ||
    new URL(siteOrigin).origin !== siteOrigin ||
    !['live', 'test'].includes(mode ?? '') ||
    (mode === 'test' && !testCode) ||
    (mode === 'live' &&
      (read('APP_ENV') !== 'production' ||
        read('DEPLOYMENT_KIND') !== 'production' ||
        new URL(siteOrigin).protocol !== 'https:'))
  )
    throw new Error('Marketing delivery configuration invalid')
  return {
    pixelId,
    accessToken,
    apiVersion,
    mode: mode === 'live' ? 'live' : 'test',
    testCode,
    siteOrigin,
  }
}

export async function deliverMetaEvent(
  payload: Record<string, unknown>,
  config: DeliveryConfig,
  send: typeof fetch = fetch,
): Promise<MetaResult> {
  let response: Response
  try {
    response = await send(
      `https://graph.facebook.com/${config.apiVersion}/${config.pixelId}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [payload],
          ...(config.mode === 'test'
            ? { test_event_code: config.testCode }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    return { outcome: 'retry', code: 'network_or_timeout' }
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { outcome: 'retry', code: `invalid_response_${response.status}` }
  }
  const record = data && typeof data === 'object' ? data : {}
  const error =
    'error' in record && record.error && typeof record.error === 'object'
      ? record.error
      : {}
  const code =
    'code' in error && typeof error.code === 'number' ? error.code : null
  if (
    response.ok &&
    'events_received' in record &&
    record.events_received === 1
  )
    return { outcome: 'delivered', code: 'accepted' }
  const transient =
    response.status === 429 ||
    response.status >= 500 ||
    ('is_transient' in error && error.is_transient === true) ||
    (code !== null && [1, 2, 4, 17, 32, 613].includes(code))
  return {
    outcome: transient || response.ok ? 'retry' : 'failed',
    code: code === null ? `http_${response.status}` : `meta_${code}`,
  }
}
