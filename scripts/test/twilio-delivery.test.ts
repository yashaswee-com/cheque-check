import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

interface Provider {
  initiateCall(
    to: string,
    twiml: string,
  ): Promise<{ success: boolean; sid?: string; uncertain?: boolean }>
}
let provider: Provider
beforeAll(async () => {
  const url = pathToFileURL(
    resolve('supabase', 'functions', '_shared', 'twilio-voice.service.ts'),
  ).href
  const edgeModule = await import(/* @vite-ignore */ url)
  provider = new edgeModule.TwilioVoiceService({
    accountSid: 'test',
    authToken: 'test',
    fromNumber: '+919800000000',
  })
})
afterEach(() => vi.unstubAllGlobals())
describe('provider outcome classification', () => {
  it('requires a call identifier and an explicit request deadline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ sid: 'CA1' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await provider.initiateCall('+919800000000', '<Response/>')).toEqual(
      { success: true, sid: 'CA1' },
    )
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it.each([400, 429, 500, 503])(
    'classifies HTTP %i without blind retries',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ message: 'provider failure' }, { status }),
          ),
      )
      expect(
        await provider.initiateCall('+919800000000', '<Response/>'),
      ).toMatchObject({
        success: false,
        uncertain: status >= 500,
      })
    },
  )
  it('holds accepted responses without identifiers and network failures as uncertain', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 201 }))
      .mockRejectedValueOnce(new Error('connection lost'))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await provider.initiateCall('+919800000000', '<Response/>'),
    ).toMatchObject({ success: false, uncertain: true })
    expect(
      await provider.initiateCall('+919800000000', '<Response/>'),
    ).toMatchObject({ success: false, uncertain: true })
  })
})
