// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  deliverMetaEvent,
  resolveDeliveryConfig,
  accountMatching,
  parseDeliveryClaim,
  type DeliveryConfig,
} from '../../../supabase/functions/marketing-delivery/delivery'

const config: DeliveryConfig = {
  pixelId: '12345',
  accessToken: 'illustrative-test-token',
  apiVersion: 'v25.0',
  mode: 'test',
  testCode: 'TEST_ONLY',
}
describe('Meta delivery', () => {
  it('builds fresh hashed account matching without retaining old browser/IP context', async () => {
    const data = await accountMatching({
      id: 'illustrative-account',
      email: ' Example@Example.Test ',
      email_confirmed_at: '2026-01-01',
      phone: '+91 98765 43210',
      phone_confirmed_at: '2026-01-01',
    })
    expect(data.external_id[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(data.em[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(data.ph[0]).toMatch(/^[a-f0-9]{64}$/)
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex')
    expect(data.em).toEqual([hash('example@example.test')])
    expect(data.ph).toEqual([hash('919876543210')])
    expect(data).not.toHaveProperty('client_ip_address')
    expect(data).not.toHaveProperty('fbp')
    expect(
      await accountMatching({
        id: 'illustrative-account',
        email: 'unverified@example.test',
      }),
    ).not.toHaveProperty('em')
  })
  it('keeps the internal account ID separate from the outbound payload', () => {
    const claim = {
      event_id: crypto.randomUUID(),
      lease_token: crypto.randomUUID(),
      mode: 'live',
      owner: crypto.randomUUID(),
      payload: { user_data: {} },
    }
    expect(parseDeliveryClaim(claim).owner).toBe(claim.owner)
    expect(parseDeliveryClaim(claim).payload).not.toHaveProperty('owner')
    expect(() => parseDeliveryClaim({ ...claim, owner: 123 })).toThrow(
      'Invalid marketing claim',
    )
  })
  it('requires explicit test codes in QA and rejects live QA delivery', () => {
    const env: Record<string, string> = {
      META_PIXEL_ID: '12345',
      META_CAPI_ACCESS_TOKEN: 'illustrative',
      META_GRAPH_API_VERSION: 'v25.0',
      MARKETING_SITE_ORIGIN: 'https://example.test',
      MARKETING_DELIVERY_MODE: 'test',
      APP_ENV: 'qa',
      DEPLOYMENT_KIND: 'qa',
    }
    const read = (key: string) => env[key]
    expect(() => resolveDeliveryConfig(read)).toThrow('configuration invalid')
    env.META_TEST_EVENT_CODE = 'TEST_ONLY'
    expect(resolveDeliveryConfig(read).mode).toBe('test')
    env.MARKETING_DELIVERY_MODE = 'live'
    expect(() => resolveDeliveryConfig(read)).toThrow('configuration invalid')
    env.APP_ENV = 'production'
    env.DEPLOYMENT_KIND = 'production'
    expect(resolveDeliveryConfig(read).mode).toBe('live')
  })
  it('uses bearer authentication, a shared event ID and explicit test mode', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ events_received: 1 }))
    const event = {
      event_id: 'stable-id',
      event_name: 'Purchase',
      event_time: 123,
    }
    expect(await deliverMetaEvent(event, config, send)).toEqual({
      outcome: 'delivered',
      code: 'accepted',
    })
    const [url, options] = send.mock.calls[0]
    expect(url).not.toContain(config.accessToken)
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${config.accessToken}`,
    })
    expect(JSON.parse(String(options?.body))).toEqual({
      data: [event],
      test_event_code: 'TEST_ONLY',
    })
  })
  it.each([429, 500, 503])(
    'retries HTTP %i with stable payloads',
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: {} }, { status }))
      expect((await deliverMetaEvent({}, config, send)).outcome).toBe('retry')
    },
  )
  it('fails permanent API errors without retaining response messages', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 190, message: 'do not persist this' } },
          { status: 400 },
        ),
      )
    expect(await deliverMetaEvent({}, config, send)).toEqual({
      outcome: 'failed',
      code: 'meta_190',
    })
  })
  it('does not mistake a 200 response with no received event for success', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ events_received: 0 }))
    expect((await deliverMetaEvent({}, config, send)).outcome).toBe('retry')
  })
  it('retries network uncertainty and malformed responses', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))
    expect((await deliverMetaEvent({}, config, send)).outcome).toBe('retry')
    send.mockResolvedValue(new Response('not json'))
    expect((await deliverMetaEvent({}, config, send)).outcome).toBe('retry')
  })
  it('omits test codes in live delivery', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ events_received: 1 }))
    await deliverMetaEvent({}, { ...config, mode: 'live' }, send)
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).not.toHaveProperty(
      'test_event_code',
    )
  })
})
