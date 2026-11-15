import type { ScanCandidates, ScanJob } from '@/validators/cheque-scan'

export interface OcrUnmatchedEntities {
  payee_name?: string
  account_name?: string
  account_number?: string
  ifsc_code?: string
  bank_name?: string
  bank_id?: string
}

export interface OcrCreateOptions {
  party: boolean
  account: boolean
}

export interface OcrExtractionState {
  job: ScanJob | null
  isExtracting: boolean
  isCreatingInline: boolean
  errorCode: string | null
  needsConsent: boolean
  candidates: ScanCandidates
  unmatchedEntities: OcrUnmatchedEntities | null
  createOptions: OcrCreateOptions
  partyContact: string
  allowDuplicate: boolean
  duplicateWarning: boolean
  applied: boolean
}

export const initialOcrExtractionState: OcrExtractionState = {
  job: null,
  isExtracting: false,
  isCreatingInline: false,
  errorCode: null,
  needsConsent: false,
  candidates: { parties: [], accounts: [] },
  unmatchedEntities: null,
  createOptions: { party: false, account: false },
  partyContact: '',
  allowDuplicate: false,
  duplicateWarning: false,
  applied: false,
}

export type OcrExtractionAction =
  | {
      type: 'update'
      update: (state: OcrExtractionState) => OcrExtractionState
    }
  | { type: 'scan-started' }

export function ocrExtractionReducer(
  state: OcrExtractionState,
  action: OcrExtractionAction,
): OcrExtractionState {
  if (action.type === 'scan-started') {
    return {
      ...state,
      errorCode: null,
      applied: false,
      candidates: { parties: [], accounts: [] },
      unmatchedEntities: null,
      isExtracting: true,
    }
  }

  return action.update(state)
}
