import type { AccountDraft, ChequeDraft, PartyDraft } from '@/types'

const base = {
  id: 'd1',
  business_id: 'b1',
  is_draft: true as const,
  created_at: '2026-11-15',
  updated_at: '2026-11-15',
}

export const chequeDraftFixture: ChequeDraft = {
  ...base,
  party_id: null,
  account_id: null,
  cheque_number: null,
  amount: null,
  cheque_date: null,
  deposit_date: null,
  type: null,
  notes: null,
  image_url: null,
}
export const partyDraftFixture: PartyDraft = {
  ...base,
  name: null,
  contact: null,
  email: null,
  address: null,
  notes: null,
  color: null,
  avatar_url: null,
}
export const accountDraftFixture: AccountDraft = {
  ...base,
  bank_id: null,
  account_name: null,
  account_number: null,
  ifsc_code: null,
  color: null,
  notes: null,
  opening_balance: null,
  is_default: false,
}
