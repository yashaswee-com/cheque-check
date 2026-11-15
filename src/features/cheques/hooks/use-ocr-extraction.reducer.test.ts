import { describe, expect, it } from 'vitest'
import {
  initialOcrExtractionState,
  ocrExtractionReducer,
} from './use-ocr-extraction.reducer'

describe('OCR extraction state reducer', () => {
  it('applies typed values and functional updates without mutating prior state', () => {
    const withContact = ocrExtractionReducer(initialOcrExtractionState, {
      type: 'update',
      update: (previous) => ({ ...previous, partyContact: '5550101' }),
    })
    const withOptions = ocrExtractionReducer(withContact, {
      type: 'update',
      update: (previous) => ({
        ...previous,
        createOptions: { ...previous.createOptions, party: true },
      }),
    })

    expect(initialOcrExtractionState.partyContact).toBe('')
    expect(withOptions.partyContact).toBe('5550101')
    expect(withOptions.createOptions).toEqual({ party: true, account: false })
  })

  it('resets scan-specific state when a new attempt begins', () => {
    const before = {
      ...initialOcrExtractionState,
      errorCode: 'SCAN_UNAVAILABLE',
      applied: true,
      isExtracting: false,
      unmatchedEntities: { payee_name: 'Payee' },
      candidates: { parties: [], accounts: [] },
    }

    expect(ocrExtractionReducer(before, { type: 'scan-started' })).toEqual({
      ...before,
      errorCode: null,
      applied: false,
      isExtracting: true,
      unmatchedEntities: null,
      candidates: { parties: [], accounts: [] },
    })
  })
})
