// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBanDuration } from '../commands/account'
import { assertQaTargets, refFromAnyUrl } from '../commands/dev/e2e-qa'
import { upsertEnvValues } from '../commands/dev/setup'
import { parsePublicStorageUrl } from '../commands/dev/storage-migrate'
import { executeBulkRow, parseBulkCsv, type BulkRow } from '../domain/bulk'
import * as monetization from '../domain/monetization'
import {
  describeJobOutcome,
  QUOTA_EXHAUSTED_ERROR,
  waitForJobs,
} from '../domain/notifications'
import { GuardRefusedError, UsageError } from '../lib/errors'
import type { AdminClient } from '../lib/supabase'

vi.mock('../domain/monetization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/monetization')>()
  return {
    ...actual,
    getEntitlement: vi.fn(),
    getProduct: vi.fn(),
    setEntitlement: vi.fn(),
    topupQuota: vi.fn(),
    grantSubscription: vi.fn(),
  }
})

describe('parseBulkCsv', () => {
  it('parses valid rows and reports invalid ones with line numbers', () => {
    const { rows, errors } = parseBulkCsv(
      [
        'email,action,amount,reason',
        'A@x.com,lifetime,,VIP',
        'b@x.com,topup-voice,50,',
        'bad,trial,,',
        'c@x.com,teleport,,',
        'd@x.com,trial,0,',
      ].join('\n'),
    )
    expect(rows).toEqual([
      {
        line: 2,
        email: 'a@x.com',
        action: 'lifetime',
        amount: null,
        reason: 'VIP',
      },
      {
        line: 3,
        email: 'b@x.com',
        action: 'topup-voice',
        amount: 50,
        reason: null,
      },
    ])
    expect(errors.map((error) => [error.line, error.error])).toEqual([
      [4, 'Invalid email "bad"'],
      [5, expect.stringContaining('Unknown action "teleport"')],
      [6, expect.stringContaining('Invalid amount "0"')],
    ])
  })

  it('requires the email and action columns', () => {
    expect(() => parseBulkCsv('mail,what\na@x.com,lifetime')).toThrow(
      UsageError,
    )
  })
})

describe('executeBulkRow', () => {
  const db = {} as AdminClient
  const context = { operator: 'ops@example.com', reason: 'Campaign' }
  const row = (overrides: Partial<BulkRow>): BulkRow => ({
    line: 2,
    email: 'a@x.com',
    action: 'lifetime',
    amount: null,
    reason: null,
    ...overrides,
  })

  beforeEach(() => vi.mocked(monetization.setEntitlement).mockReset())

  it('skips users who already have lifetime premium', async () => {
    vi.mocked(monetization.getEntitlement).mockResolvedValue({
      status: 'active',
      valid_until: null,
    } as never)
    await expect(executeBulkRow(db, row({}), 'u1', context)).resolves.toBe(
      'already lifetime',
    )
    expect(monetization.setEntitlement).not.toHaveBeenCalled()
  })

  it('grants lifetime through the audited RPC with the row reason first', async () => {
    vi.mocked(monetization.getEntitlement).mockResolvedValue(null)
    await executeBulkRow(db, row({ reason: 'VIP' }), 'u1', context)
    expect(monetization.setEntitlement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'u1',
        status: 'active',
        validUntil: null,
        action: 'premium.grant_lifetime',
        reason: 'VIP',
        operator: 'ops@example.com',
      }),
    )
  })

  it('computes trial expiry from the amount in days', async () => {
    const now = new Date('2030-01-01T00:00:00Z')
    await expect(
      executeBulkRow(db, row({ action: 'trial', amount: 7 }), 'u1', {
        ...context,
        now,
      }),
    ).resolves.toBe('7-day trial')
    expect(monetization.setEntitlement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ status: 'trialing', reason: 'Campaign' }),
    )
  })

  it('defaults top-ups to the pack size', async () => {
    vi.mocked(monetization.getProduct).mockResolvedValue({
      quota_increment: 25,
    } as never)
    vi.mocked(monetization.topupQuota).mockResolvedValue({
      after: { limit: 40 },
    } as never)
    const result = await executeBulkRow(
      db,
      row({ action: 'topup-ai' }),
      'u1',
      context,
    )
    expect(result).toContain('+25')
    expect(monetization.topupQuota).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        featureId: monetization.METERED.ai.quotaFeature,
        amount: 25,
      }),
    )
  })
})

describe('parseBanDuration', () => {
  it('maps presets and hour durations', () => {
    expect(parseBanDuration('7D')).toBe('168h')
    expect(parseBanDuration('none')).toBe('none')
    expect(parseBanDuration('48h')).toBe('48h')
    expect(() => parseBanDuration('0h')).toThrow(UsageError)
    expect(() => parseBanDuration('forever')).toThrow(UsageError)
  })
})

describe('e2e-qa target guard', () => {
  it('extracts refs from API, direct and pooler URLs', () => {
    expect(refFromAnyUrl('https://qaref.supabase.co')).toBe('qaref')
    expect(
      refFromAnyUrl('postgresql://postgres@db.qaref.supabase.co:5432/postgres'),
    ).toBe('qaref')
    expect(
      refFromAnyUrl(
        'postgresql://postgres.qaref:pw@aws-0.pooler.supabase.com:6543/postgres',
      ),
    ).toBe('qaref')
    expect(refFromAnyUrl(undefined)).toBeNull()
  })

  it('refuses mismatched or production targets', () => {
    const api = 'https://qaref.supabase.co'
    expect(() =>
      assertQaTargets(
        api,
        'postgresql://postgres@db.qaref.supabase.co/x',
        undefined,
      ),
    ).not.toThrow()
    expect(() =>
      assertQaTargets(
        api,
        'postgresql://postgres@db.other.supabase.co/x',
        undefined,
      ),
    ).toThrow(GuardRefusedError)
    expect(() =>
      assertQaTargets(
        api,
        'postgresql://postgres@db.qaref.supabase.co/x',
        'https://qaref.supabase.co',
      ),
    ).toThrow(GuardRefusedError)
  })
})

describe('upsertEnvValues', () => {
  it('replaces existing keys, appends new ones and skips empty values', () => {
    expect(upsertEnvValues('A=1\r\nB=2\n', { B: '3', C: '4', D: '' })).toBe(
      'A=1\nB=3\nC=4\n',
    )
  })
})

describe('parsePublicStorageUrl', () => {
  const base = 'https://ref.supabase.co/storage/v1/object/public'

  it('extracts bucket and decoded path for migratable buckets', () => {
    expect(parsePublicStorageUrl(`${base}/avatars/u1/me%20pic.png`)).toEqual({
      bucket: 'avatars',
      path: 'u1/me pic.png',
    })
  })

  it('rejects other buckets, traversal and non-storage URLs', () => {
    expect(parsePublicStorageUrl(`${base}/other/u1/a.png`)).toBeNull()
    expect(
      parsePublicStorageUrl(`${base}/avatars/u1/..%2F..%2Fsecret.png`),
    ).toBeNull()
    expect(
      parsePublicStorageUrl(`${base}/avatars/u1/..%5Csecret.png`),
    ).toBeNull()
    expect(parsePublicStorageUrl('https://example.com/a.png')).toBeNull()
    expect(parsePublicStorageUrl('not a url')).toBeNull()
  })
})

describe('waitForJobs', () => {
  function jobsDb(responses: { id: string; status: string }[][]) {
    const inFn = vi.fn(() =>
      Promise.resolve({ data: responses.shift() ?? [], error: null }),
    )
    const db = {
      from: () => ({ select: () => ({ in: inFn }) }),
    } as unknown as AdminClient
    return { db, inFn }
  }

  it('polls until every job settles', async () => {
    const { db, inFn } = jobsDb([
      [{ id: 'j1', status: 'pending' }],
      [{ id: 'j1', status: 'processing' }],
      [{ id: 'j1', status: 'sent' }],
    ])
    const sleep = vi.fn(() => Promise.resolve())
    const result = await waitForJobs(db, ['j1'], { sleep })
    expect(result.timedOut).toBe(false)
    expect(result.jobs[0].status).toBe('sent')
    expect(inFn).toHaveBeenCalledTimes(3)
  })

  it('reports a timeout when jobs stay open', async () => {
    const { db } = jobsDb([[{ id: 'j1', status: 'pending' }]])
    const result = await waitForJobs(db, ['j1'], { timeoutMs: 0 })
    expect(result.timedOut).toBe(true)
  })

  it('explains job outcomes for support staff', () => {
    expect(
      describeJobOutcome({
        status: 'skipped',
        last_error: QUOTA_EXHAUSTED_ERROR,
      }),
    ).toMatch(/quota topup voice/)
    expect(
      describeJobOutcome({ status: 'failed', last_error: 'Twilio 21211' }),
    ).toBe('Failed: Twilio 21211')
  })
})
