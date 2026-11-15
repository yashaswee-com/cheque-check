import { describe, expect, it } from 'vitest'
import type { ScanCandidates, ScanJob } from '@/validators/cheque-scan'
import {
  canApplyOcrResult,
  getOcrFieldUpdates,
  getUniqueExactAccountId,
  type OcrFieldSnapshot,
} from './ocr-field-policy'

const job = {
  id: 'job',
  business_id: 'business',
  image_url: '/image.jpg',
  mode: 'Inward',
  details: {
    amount: 1500,
    cheque_number: '001234',
    cheque_date: '2026-11-14',
  },
} as ScanJob

const snapshot: OcrFieldSnapshot = {
  amount: 0,
  cheque_number: '',
  cheque_date: '',
  party_id: '',
  account_id: '',
}

describe('OCR field policy', () => {
  it('requires the current business, image, mode, and mounted hook', () => {
    const context = {
      mounted: true,
      businessId: 'business',
      imageUrl: '/image.jpg',
      mode: 'Inward' as const,
    }

    expect(canApplyOcrResult(job, context)).toBe(true)
    expect(canApplyOcrResult(job, { ...context, mounted: false })).toBe(false)
    expect(canApplyOcrResult(job, { ...context, businessId: 'other' })).toBe(
      false,
    )
    expect(canApplyOcrResult(job, { ...context, imageUrl: '/other.jpg' })).toBe(
      false,
    )
    expect(canApplyOcrResult(job, { ...context, mode: 'Outward' })).toBe(false)
  })

  it('returns only selected, non-null fields unchanged since the snapshot', () => {
    const result = {
      ...job,
      details: { ...job.details!, cheque_date: null },
    }
    expect(
      getOcrFieldUpdates(
        result,
        ['amount', 'cheque_number', 'cheque_date'],
        snapshot,
        { ...snapshot, amount: 42 },
      ),
    ).toEqual({ cheque_number: '001234' })
  })

  it('does not apply values when no snapshot or details exist', () => {
    expect(getOcrFieldUpdates(job, ['amount'], null, snapshot)).toEqual({})
    expect(
      getOcrFieldUpdates(
        { ...job, details: null },
        ['amount'],
        snapshot,
        snapshot,
      ),
    ).toEqual({})
  })

  it('automatically selects only one exact account while its field is unchanged', () => {
    const candidates: ScanCandidates = {
      parties: [],
      accounts: [
        {
          id: 'exact-id',
          name: 'Account',
          score: 1,
          reason: 'exact',
          exact: true,
        },
      ],
    }

    expect(getUniqueExactAccountId(candidates, snapshot, '')).toBe('exact-id')
    expect(
      getUniqueExactAccountId(candidates, snapshot, 'manual-id'),
    ).toBeNull()
    expect(
      getUniqueExactAccountId(
        {
          ...candidates,
          accounts: [
            ...candidates.accounts,
            { ...candidates.accounts[0], id: 'another-id' },
          ],
        },
        snapshot,
        '',
      ),
    ).toBeNull()
  })
})
