import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import {
  describeJobOutcome,
  planReminderCalls,
  runDispatcher,
} from '../domain/notifications'
import { OpsError } from '../lib/errors'

interface Orchestrator {
  run(
    batchSize?: number,
    scope?: { userId: string; jobIds: string[] },
  ): Promise<
    {
      jobId: string
      status: string
      error?: string
      providerMessageId?: string
    }[]
  >
}
type OrchestratorCtor = new (
  db: unknown,
  twilio: unknown,
  testMode?: { enabled: boolean; phone: string },
) => Orchestrator

// Edge code uses Deno-style imports; load it dynamically so the root
// TypeScript project never follows them.
let DispatcherOrchestrator: OrchestratorCtor
let TwilioVoiceService: new (config: {
  accountSid: string
  authToken: string
  fromNumber: string
}) => { generateTwiML(message: string, language?: string): string }
beforeAll(async () => {
  const url = pathToFileURL(
    resolve(
      'supabase/functions/notifications-dispatcher/orchestrators/dispatcher.orchestrator.ts',
    ),
  ).href
  ;({ DispatcherOrchestrator } = (await import(/* @vite-ignore */ url)) as {
    DispatcherOrchestrator: OrchestratorCtor
  })
  const twilioUrl = pathToFileURL(
    resolve('supabase', 'functions', '_shared', 'twilio-voice.service.ts'),
  ).href
  ;({ TwilioVoiceService } = (await import(/* @vite-ignore */ twilioUrl)) as {
    TwilioVoiceService: typeof TwilioVoiceService
  })
})

const credentials = { url: 'https://example.test', serviceRoleKey: 'test-key' }
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function expectErrorLogs(...calls: [message: string, error: unknown][]) {
  const log = vi.spyOn(console, 'error')
  calls.forEach(() => log.mockImplementationOnce(() => {}))
  onTestFinished(() => {
    expect(log.mock.calls).toEqual(
      calls.map(([message, error]) => [
        expect.stringContaining(message),
        error,
      ]),
    )
  })
}

function expectFinalizationErrors(error: Error) {
  expectErrorLogs(
    [`Delivery finalization failed for ${JOB}`, error],
    [`Delivery finalization failed for ${JOB}`, error],
    [`Delivery finalization failed for ${JOB}`, error],
    [`Dispatch crashed for job ${JOB}`, error.message],
  )
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('runDispatcher scope', () => {
  it('sends the user and job ids for a targeted run', async () => {
    const fetchMock = stubFetch({ processed: 1, results: [] })
    await runDispatcher(credentials, { userId: USER, jobIds: [JOB] })
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init[0]).toMatch(/notifications-dispatcher$/)
    expect(JSON.parse(String(init[1].body))).toEqual({
      userId: USER,
      jobIds: [JOB],
    })
  })

  it('keeps the global cron-style run unscoped', async () => {
    const fetchMock = stubFetch({ processed: 0, results: [] })
    await runDispatcher(credentials)
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init[1].body))).toEqual({})
  })

  it('refuses an empty scope instead of falling back to a global run', async () => {
    const fetchMock = stubFetch({ processed: 0, results: [] })
    await expect(
      runDispatcher(credentials, { userId: USER, jobIds: [] }),
    ).rejects.toThrow(OpsError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not report success when the dispatcher returns nothing usable', async () => {
    stubFetch({ success: true })
    await expect(runDispatcher(credentials)).rejects.toThrow(OpsError)
  })
})

describe('planReminderCalls', () => {
  const preview = {
    businesses: [
      { businessId: 'a', chequeIds: ['1', '2'] },
      { businessId: 'b', chequeIds: ['3'] },
    ],
  }
  it('costs one call per business with due cheques', () => {
    expect(planReminderCalls(preview, 5)).toMatchObject({
      businesses: 2,
      cheques: 3,
      calls: 2,
      quotaShortfall: 0,
    })
  })
  it('reports the shortfall when quota is short or unusable', () => {
    expect(planReminderCalls(preview, 1).quotaShortfall).toBe(1)
    expect(planReminderCalls(preview, null).quotaShortfall).toBe(2)
  })
})

describe('describeJobOutcome', () => {
  it('does not claim the user answered', () => {
    expect(describeJobOutcome({ status: 'sent', last_error: null })).toMatch(
      /Accepted by the call provider.*not prove/,
    )
  })
})

type Job = {
  id: string
  user_id: string
  business_id: string | null
  channel: 'voice'
  purpose: string
  payload: Record<string, unknown>
  attempts: number
  claim_token: string
}

function makeOrchestrator(
  job: Job,
  overrides: Record<string, unknown> = {},
  twilioResult: {
    success: boolean
    sid?: string
    error?: string
    uncertain?: boolean
  } = {
    success: true,
    sid: 'CA1',
  },
) {
  const db = {
    claimJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
    fetchProfile: vi.fn(async () => ({
      user_id: job.user_id,
      name: 'Asha',
      phone: '+919800000000',
      language: 'en',
      currency: '₹',
      voice_call_enabled: true,
      deleted_at: null,
    })),
    isBusinessActive: vi.fn(async () => true),
    fetchCheques: vi.fn(async () => [
      { id: 'c1', amount: 10, account: { bank: { name: 'HDFC' } } },
    ]),
    startDelivery: vi.fn(async () => ({
      status: 'started',
      startBefore: Date.now() + 20000,
    })),
    finishDelivery: vi.fn(async () => undefined),
    markSkipped: vi.fn(async () => undefined),
    markFailedOrRetry: vi.fn(async () => undefined),
    writeLog: vi.fn(async () => undefined),
    ...overrides,
  }
  const twilio = {
    generateTwiML: vi.fn<(message: string, language?: string) => string>(
      () => '<Response/>',
    ),
    initiateCall: vi.fn<
      (to: string, twiml: string) => Promise<typeof twilioResult>
    >(async () => twilioResult),
  }
  const orchestrator = new DispatcherOrchestrator(db as never, twilio as never)
  return { orchestrator, db, twilio }
}

const reminder: Job = {
  id: JOB,
  user_id: USER,
  business_id: '33333333-3333-4333-8333-333333333333',
  channel: 'voice',
  purpose: 'cheque_reminder',
  payload: { cheque_ids: ['c1'] },
  attempts: 1,
  claim_token: '44444444-4444-4444-8444-444444444444',
}

describe('dispatcher eligibility', () => {
  it('resolves reminder dates and slots from the profile time zone', async () => {
    const url = pathToFileURL(
      resolve('supabase', 'functions', '_shared', 'notifications.ts'),
    ).href
    const { getLocalTime } = (await import(/* @vite-ignore */ url)) as {
      getLocalTime: (
        instant: Date,
        timeZone: string,
      ) => { date: string; minutesOfDay: number }
    }

    expect(
      getLocalTime(new Date('2026-03-01T18:45:00.000Z'), 'Asia/Kolkata'),
    ).toEqual({ date: '2026-03-02', minutesOfDay: 15 })
  })

  it('formats reminder totals using profile currency and speaks the selected mixed language', async () => {
    const { orchestrator, twilio } = makeOrchestrator(reminder, {
      fetchProfile: async () => ({
        user_id: USER,
        name: 'Asha',
        phone: '+919800000000',
        language: 'hi-en',
        currency: '€',
        voice_call_enabled: true,
        deleted_at: null,
      }),
      fetchCheques: async () => [
        { id: 'c1', amount: 10, account: { bank: { name: 'HDFC' } } },
        { id: 'c2', amount: 4.5, account: { bank: { name: 'HDFC' } } },
      ],
    })

    await orchestrator.run(1)

    expect(twilio.generateTwiML).toHaveBeenCalledWith(
      expect.stringContaining(
        'दो cheques HDFC mein, total चौदह दशमलव पाँच यूरो',
      ),
      'hi-en',
    )
    expect(twilio.generateTwiML).toHaveBeenCalledWith(
      expect.stringContaining('Namaste Asha'),
      'hi-en',
    )
  })

  it('uses the bilingual Hindi voice for the hi-en preference', () => {
    const voice = new TwilioVoiceService({
      accountSid: 'test',
      authToken: 'test',
      fromNumber: '+919800000000',
    })

    expect(voice.generateTwiML('Namaste Asha', 'hi-en')).toContain(
      'language="hi-IN">Namaste Asha</Say>',
    )
    expect(voice.generateTwiML('Namaste Asha', 'hi-en')).toContain(
      'Dhanyavaad.',
    )
  })

  describe.each(['hi', 'hi-en'])('%s spoken reminder numbers', (language) => {
    it.each([
      [0, 'शून्य'],
      [0.05, 'शून्य दशमलव शून्य पाँच'],
      [1, 'एक'],
      [1.01, 'एक दशमलव शून्य एक'],
      [14.5, 'चौदह दशमलव पाँच'],
      [999.999, 'एक हज़ार'],
      [12521.05, 'बारह हज़ार पाँच सौ इक्कीस दशमलव शून्य पाँच'],
      [1234567.89, 'बारह लाख चौंतीस हज़ार पाँच सौ सड़सठ दशमलव आठ नौ'],
      [10000000, 'एक करोड़'],
    ])('sends %s as Hindi words in escaped TwiML', async (amount, words) => {
      const { orchestrator, twilio } = makeOrchestrator(reminder, {
        fetchProfile: async () => ({
          user_id: USER,
          name: 'Asha & Co 2',
          phone: '+919800000000',
          language,
          currency: '₹',
          voice_call_enabled: true,
          deleted_at: null,
        }),
        fetchCheques: async () => [
          { id: 'c1', amount, account: { bank: { name: 'Bank <24>' } } },
        ],
      })
      const voice = new TwilioVoiceService({
        accountSid: 'test',
        authToken: 'test',
        fromNumber: '+919800000000',
      })
      twilio.generateTwiML.mockImplementation((message, locale) =>
        voice.generateTwiML(message, locale),
      )

      expect(await orchestrator.run(1)).toMatchObject([{ status: 'sent' }])

      const twiml = twilio.initiateCall.mock.calls[0][1]
      const document = new DOMParser().parseFromString(twiml, 'text/xml')
      expect(document.querySelector('parsererror')).toBeNull()
      const say = document.querySelector('Say')
      expect(say?.getAttribute('language')).toBe('hi-IN')
      expect(say?.getAttribute('voice')).toBe('Polly.Aditi')
      expect(say?.textContent).toContain(
        `${words} भारतीय ${amount <= 1 ? 'रुपया' : 'रुपए'}`,
      )
      expect(say?.textContent).toContain(
        language === 'hi' ? 'एक चेक' : 'एक cheque',
      )
      expect(say?.textContent).toContain('Asha & Co 2')
      expect(say?.textContent).toContain('Bank <24>')
    })

    it.each([
      ['$', 'यूएस डॉलर'],
      ['€', 'यूरो'],
      ['£', 'ब्रिटिश पाउंड'],
    ])('keeps the selected %s currency', async (currency, unit) => {
      const { orchestrator, twilio } = makeOrchestrator(reminder, {
        fetchProfile: async () => ({
          user_id: USER,
          name: 'Asha',
          phone: '+919800000000',
          language,
          currency,
          voice_call_enabled: true,
          deleted_at: null,
        }),
      })

      await orchestrator.run(1)

      expect(twilio.generateTwiML).toHaveBeenCalledWith(
        expect.stringContaining(`दस ${unit}`),
        language,
      )
    })
  })

  it('preserves English counts, amounts and voice language', async () => {
    const { orchestrator, twilio } = makeOrchestrator(reminder)
    await orchestrator.run(1)
    expect(twilio.generateTwiML).toHaveBeenCalledWith(
      expect.stringContaining(
        '1 cheque hitting HDFC for a total of 10.00 Indian rupees',
      ),
      'en',
    )
    const voice = new TwilioVoiceService({
      accountSid: 'test',
      authToken: 'test',
      fromNumber: '+919800000000',
    })
    expect(
      voice.generateTwiML('1 cheque, 10.00 Indian rupees', 'en'),
    ).toContain('language="en-IN">1 cheque, 10.00 Indian rupees</Say>')
  })

  it('passes the scope to the claim and reports the provider id', async () => {
    const { orchestrator, db } = makeOrchestrator(reminder)
    const scope = { userId: USER, jobIds: [JOB] }
    const results = await orchestrator.run(50, scope)
    expect(db.claimJobs).toHaveBeenCalledWith(5, scope)
    expect(results).toEqual([
      { jobId: JOB, status: 'sent', providerMessageId: 'CA1' },
    ])
  })

  describe('dispatcher aggregate run metrics', () => {
    function summary(log: { mock: { calls: unknown[][] } }) {
      const json = log.mock.calls
        .map((call) => call[0])
        .find(
          (value) =>
            typeof value === 'string' &&
            value.startsWith(
              '{"level":"info","event":"notification.dispatcher.run"',
            ),
        )
      expect(json).toBeTypeOf('string')
      return JSON.parse(String(json))
    }
    it('reports provider acceptance separately from durable settlement without private data', async () => {
      const error = new Error('database failure')
      expectFinalizationErrors(error)
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const { orchestrator } = makeOrchestrator(reminder, {
          finishDelivery: vi.fn().mockRejectedValue(error),
        })
        await orchestrator.run(50)
        const metric = summary(log)
        expect(metric).toMatchObject({
          event: 'notification.dispatcher.run',
          processed: 1,
          sent: 0,
          failed_jobs: 1,
          provider_requests: 1,
          provider_accepted: 1,
          reconciliation_required: 1,
          finalization_retries: 2,
          stop_reason: 'empty_queue',
        })
        expect(JSON.stringify(metric)).not.toContain(USER)
        expect(JSON.stringify(metric)).not.toContain(JOB)
        expect(JSON.stringify(metric)).not.toContain('CA1')
        expect(metric.duration_ms).toBeGreaterThanOrEqual(0)
      } finally {
        log.mockRestore()
      }
    })
    it('counts uncertain outcomes and skipped work without claiming sent delivery', async () => {
      expectErrorLogs([`Voice call failed for job ${JOB}`, 'timeout'])
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const { orchestrator } = makeOrchestrator(
          reminder,
          {},
          { success: false, uncertain: true, error: 'timeout' },
        )
        await orchestrator.run(50)
        expect(summary(log)).toMatchObject({
          provider_uncertain: 1,
          reconciliation_required: 1,
          sent: 0,
          failed_jobs: 1,
        })
        log.mockClear()
        const skipped = makeOrchestrator(reminder, {
          startDelivery: async () => ({ status: 'quota_exhausted' }),
        })
        await skipped.orchestrator.run(50)
        expect(summary(log)).toMatchObject({
          skipped: 1,
          provider_requests: 0,
          reconciliation_required: 0,
        })
      } finally {
        log.mockRestore()
      }
    })
    it('emits a failed run summary when queue claims fail', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const { orchestrator } = makeOrchestrator(reminder, {
          claimJobs: vi.fn().mockRejectedValue(new Error('claim failed')),
        })
        await expect(orchestrator.run(50)).rejects.toThrow('claim failed')
        expect(summary(log)).toMatchObject({
          failed: true,
          stop_reason: 'error',
          processed: 0,
        })
      } finally {
        log.mockRestore()
      }
    })
  })

  it('claims globally when no scope is given', async () => {
    const { orchestrator, db } = makeOrchestrator(reminder)
    await orchestrator.run(50)
    expect(db.claimJobs).toHaveBeenCalledWith(5, undefined)
  })

  it.each([
    [
      'deactivated user',
      {
        fetchProfile: async () => ({ phone: '+919800000000', deleted_at: 'x' }),
      },
    ],
    [
      'voice disabled',
      {
        fetchProfile: async () => ({
          phone: '+919800000000',
          voice_call_enabled: false,
          deleted_at: null,
        }),
      },
    ],
    [
      'invalid recipient',
      {
        fetchProfile: async () => ({
          phone: '12345',
          voice_call_enabled: true,
          deleted_at: null,
        }),
      },
    ],
    ['deleted business', { isBusinessActive: async () => false }],
    ['deleted cheques', { fetchCheques: async () => [] }],
    [
      'exhausted quota',
      { startDelivery: async () => ({ status: 'quota_exhausted' }) },
    ],
  ])('skips without calling the provider: %s', async (_name, overrides) => {
    const { orchestrator, twilio, db } = makeOrchestrator(reminder, overrides)
    const [result] = await orchestrator.run(50)
    expect(result.status).toBe('skipped')
    expect(twilio.initiateCall).not.toHaveBeenCalled()
    expect(db.finishDelivery).not.toHaveBeenCalled()
  })

  it('does not consume quota when an earlier check skips the job', async () => {
    const { orchestrator, db } = makeOrchestrator(reminder, {
      isBusinessActive: async () => false,
    })
    await orchestrator.run(50)
    expect(db.startDelivery).not.toHaveBeenCalled()
  })

  it('retries via markFailedOrRetry when the provider rejects', async () => {
    expectErrorLogs([`Voice call failed for job ${JOB}`, 'bad number'])
    const { orchestrator, db } = makeOrchestrator(
      reminder,
      {},
      { success: false, error: 'bad number' },
    )
    const [result] = await orchestrator.run(50)
    expect(result).toMatchObject({ status: 'failed', error: 'bad number' })
    expect(db.finishDelivery).toHaveBeenCalledWith(
      reminder,
      'rejected',
      undefined,
      'bad number',
    )
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
  })

  it('never leaves a claimed job in processing when something throws', async () => {
    expectErrorLogs([`Dispatch crashed for job ${JOB}`, 'db down'])
    const { orchestrator, db } = makeOrchestrator(reminder, {
      fetchProfile: async () => {
        throw new Error('db down')
      },
    })
    const [result] = await orchestrator.run(50)
    expect(result).toMatchObject({ status: 'failed', error: 'db down' })
    expect(db.markFailedOrRetry).toHaveBeenCalled()
  })

  it('never calls the provider again when acceptance finalization fails', async () => {
    const error = new Error('audit unavailable')
    expectFinalizationErrors(error)
    const finishDelivery = vi.fn().mockRejectedValue(error)
    const { orchestrator, db, twilio } = makeOrchestrator(reminder, {
      finishDelivery,
    })
    const [result] = await orchestrator.run(5)
    expect(result.status).toBe('failed')
    expect(twilio.initiateCall).toHaveBeenCalledTimes(1)
    expect(finishDelivery).toHaveBeenCalledTimes(3)
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
  })

  it('does not redeliver an uncertain provider response', async () => {
    expectErrorLogs([`Voice call failed for job ${JOB}`, 'request timed out'])
    const { orchestrator, db } = makeOrchestrator(
      reminder,
      {},
      {
        success: false,
        error: 'request timed out',
        uncertain: true,
      },
    )
    await orchestrator.run(5)
    expect(db.finishDelivery).toHaveBeenCalledWith(
      reminder,
      'uncertain',
      undefined,
      'request timed out',
    )
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
  })

  it('holds an ambiguous reservation response without contacting the provider', async () => {
    expectErrorLogs([
      `Dispatch crashed for job ${JOB}`,
      'database response lost',
    ])
    const { orchestrator, db, twilio } = makeOrchestrator(reminder, {
      startDelivery: vi
        .fn()
        .mockRejectedValue(new Error('database response lost')),
    })
    await orchestrator.run(5)
    expect(twilio.initiateCall).not.toHaveBeenCalled()
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
  })

  it('bounds in-flight deliveries to five and drains more than one batch', async () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({
      ...reminder,
      id: `job-${i}`,
    }))
    let active = 0
    let peak = 0
    const claimJobs = vi.fn(async (limit: number) => jobs.splice(0, limit))
    const startDelivery = vi.fn(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { status: 'started', startBefore: Date.now() + 20000 }
    })
    const finishDelivery = vi.fn(async () => {
      active--
    })
    const { orchestrator } = makeOrchestrator(reminder, {
      claimJobs,
      startDelivery,
      finishDelivery,
    })
    expect(await orchestrator.run(12)).toHaveLength(12)
    expect(peak).toBe(5)
    expect(claimJobs.mock.calls.map(([limit]) => limit)).toEqual([5, 5, 2])
  })

  const sample: Job = {
    ...reminder,
    business_id: null,
    purpose: 'sample_voice_test',
    payload: {},
  }
  const sampleProfile = (voiceEnabled: boolean) => async () => ({
    user_id: USER,
    name: 'A',
    phone: '+919800000000',
    language: 'en',
    voice_call_enabled: voiceEnabled,
    deleted_at: null,
  })

  it('places sample calls without cheques when voice is enabled', async () => {
    const { orchestrator, db } = makeOrchestrator(sample, {
      fetchProfile: sampleProfile(true),
    })
    const [result] = await orchestrator.run(50)
    expect(result.status).toBe('sent')
    expect(db.startDelivery).toHaveBeenCalledTimes(1)
    expect(db.fetchCheques).not.toHaveBeenCalled()
  })

  it('skips sample calls when voice reminders are off, without using quota', async () => {
    const { orchestrator, db, twilio } = makeOrchestrator(sample, {
      fetchProfile: sampleProfile(false),
    })
    const [result] = await orchestrator.run(50)
    expect(result).toMatchObject({ status: 'skipped' })
    expect(db.startDelivery).not.toHaveBeenCalled()
    expect(twilio.initiateCall).not.toHaveBeenCalled()
  })

  it('skips sample calls when quota is exhausted', async () => {
    const { orchestrator, twilio } = makeOrchestrator(sample, {
      fetchProfile: sampleProfile(true),
      startDelivery: async () => ({ status: 'quota_exhausted' }),
    })
    const [result] = await orchestrator.run(50)
    expect(result.status).toBe('skipped')
    expect(twilio.initiateCall).not.toHaveBeenCalled()
  })
})
describe('shared provider backpressure integration', () => {
  it('reports throttled work as queued without contacting the provider or consuming failure handling', async () => {
    const { orchestrator, db, twilio } = makeOrchestrator(reminder, {
      startDelivery: async () => ({ status: 'throttled' }),
    })
    const [result] = await orchestrator.run(1)
    expect(result).toEqual({
      jobId: JOB,
      status: 'queued',
      error: 'Provider capacity unavailable; queued',
    })
    expect(twilio.initiateCall).not.toHaveBeenCalled()
    expect(db.markSkipped).not.toHaveBeenCalled()
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
    expect(db.finishDelivery).not.toHaveBeenCalled()
  })
  it('refunds an expired admission as a known non-send rather than calling after its deadline', async () => {
    const { orchestrator, db, twilio } = makeOrchestrator(reminder, {
      startDelivery: async () => ({
        status: 'started',
        startBefore: Date.now() - 1,
      }),
    })
    expect((await orchestrator.run(1))[0].status).toBe('failed')
    expect(twilio.initiateCall).not.toHaveBeenCalled()
    expect(db.finishDelivery).toHaveBeenCalledWith(
      reminder,
      'rejected',
      undefined,
      'Provider admission expired before request',
    )
    expect(db.markFailedOrRetry).not.toHaveBeenCalled()
  })
  it('bounds waits and emits explicit backpressure metrics without busy-spinning', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { orchestrator, db } = makeOrchestrator(reminder, {
        claimJobs: vi.fn(async () => Array.from({ length: 5 }, () => reminder)),
        startDelivery: async () => ({ status: 'throttled' }),
      })
      const started = Date.now()
      const running = orchestrator.run(1000)
      await vi.runAllTimersAsync()
      const results = await running
      expect(Date.now() - started).toBeLessThanOrEqual(40000)
      expect(db.claimJobs.mock.calls.length).toBeLessThanOrEqual(40)
      expect(results.every((result) => result.status === 'queued')).toBe(true)
      const metric = log.mock.calls
        .map(([value]) => value)
        .find(
          (value) =>
            typeof value === 'string' &&
            value.startsWith(
              '{"level":"info","event":"notification.dispatcher.run"',
            ),
        )
      expect(JSON.parse(String(metric))).toMatchObject({
        queued: results.length,
        provider_throttled: results.length,
        provider_requests: 0,
        stop_reason: 'budget',
      })
    } finally {
      vi.useRealTimers()
      log.mockRestore()
    }
  })
})

describe('scoped claim migration', () => {
  const sql = readFileSync(
    resolve(
      'supabase',
      'migrations',
      '20261021060000_scoped_voice_dispatch.sql',
    ),
    'utf8',
  )
  it('enforces the scope inside the claim query', () => {
    expect(sql).toMatch(/p_user_id IS NULL OR q\.user_id = p_user_id/)
    expect(sql).toMatch(/p_job_ids IS NULL OR q\.id = ANY\(p_job_ids\)/)
  })
  it('requires the service role and a complete scope', () => {
    expect(sql).toMatch(/<> 'service_role'/)
    expect(sql).toMatch(/needs both a user and at least one job id/)
  })
  it('replaces the unscoped signature and grants only service_role', () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.claim_notification_jobs\(int\)/,
    )
    expect(sql).toMatch(/FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/TO service_role/)
  })
  it('keeps lifecycle and pending/due filters for the cron path', () => {
    expect(sql).toMatch(/status = 'pending' AND q\.scheduled_at <= now\(\)/)
    expect(sql).toMatch(/lifecycle_user_active\(q\.user_id\)/)
    expect(sql).toMatch(/b\.deleted_at IS NULL/)
  })
})
