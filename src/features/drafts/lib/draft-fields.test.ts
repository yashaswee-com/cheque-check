import { describe, expect, it } from 'vitest'
import {
  chequeDraftToFormValues,
  firstIncompleteAccountStep,
  firstIncompleteChequeStep,
  firstIncompletePartyStep,
  toAccountDraftFields,
  toChequeDraftFields,
  toPartyDraftFields,
  partyDraftToFormValues,
  accountDraftToFormValues,
} from './draft-fields'

describe('toChequeDraftFields', () => {
  it('stores blank and invalid form values as null', () => {
    expect(
      toChequeDraftFields({
        amount: Number.NaN,
        cheque_number: '   ',
        party_id: '',
        account_id: 'a1',
        type: 'Sideways',
        image_url: null,
      }),
    ).toEqual({
      party_id: null,
      account_id: 'a1',
      cheque_number: null,
      amount: null,
      cheque_date: null,
      deposit_date: null,
      type: null,
      notes: null,
      image_url: null,
    })
  })

  it('keeps meaningful values untouched', () => {
    const fields = toChequeDraftFields({
      amount: 1500,
      cheque_number: '123456',
      type: 'Inward',
      notes: 'rent ',
    })
    expect(fields).toMatchObject({
      amount: 1500,
      cheque_number: '123456',
      type: 'Inward',
      notes: 'rent ',
    })
  })

  it('rejects zero and negative amounts', () => {
    expect(toChequeDraftFields({ amount: 0 }).amount).toBeNull()
    expect(toChequeDraftFields({ amount: -5 }).amount).toBeNull()
  })
})

describe('party and account draft fields', () => {
  it('restores blank parties with form defaults and preserves populated fields', () => {
    expect(partyDraftToFormValues(toPartyDraftFields({}))).toEqual({
      name: '',
      contact: '',
      email: '',
      address: '',
      notes: '',
      color: '#34C759',
      avatar_url: null,
    })
    const populated = {
      name: 'Acme',
      contact: '9876543210',
      email: 'a@example.test',
      address: 'Delhi',
      notes: 'Customer',
      color: '#123456',
      avatar_url: 'media:a',
    }
    expect(partyDraftToFormValues(toPartyDraftFields(populated))).toEqual(
      populated,
    )
  })

  it('restores blank accounts with form defaults and preserves balance and default selection', () => {
    expect(accountDraftToFormValues(toAccountDraftFields({}))).toEqual({
      bank_id: '',
      account_name: '',
      account_number: '',
      ifsc_code: '',
      color: '#007AFF',
      notes: '',
      opening_balance: 0,
      is_default: false,
    })
    const populated = {
      bank_id: 'b1',
      account_name: 'Main',
      account_number: '123456',
      ifsc_code: 'SBIN0001234',
      color: '#123456',
      notes: 'Business',
      opening_balance: -100,
      is_default: true,
    }
    expect(accountDraftToFormValues(toAccountDraftFields(populated))).toEqual(
      populated,
    )
  })

  it('normalizes party values', () => {
    expect(toPartyDraftFields({ name: 'Acme', contact: '' })).toMatchObject({
      name: 'Acme',
      contact: null,
      email: null,
    })
  })

  it('restores a null opening balance from a stored draft', () => {
    expect(
      accountDraftToFormValues({
        ...toAccountDraftFields({}),
        opening_balance: null,
      }),
    ).toMatchObject({ opening_balance: 0, is_default: false })
  })

  it('normalizes account values', () => {
    expect(
      toAccountDraftFields({ bank_id: 'b1', account_number: ' ' }),
    ).toMatchObject({ bank_id: 'b1', account_number: null })
  })

  it('preserves the default-account setting', () => {
    expect(toAccountDraftFields({ is_default: true }).is_default).toBe(true)
  })
})

describe('chequeDraftToFormValues', () => {
  it('fills form defaults for missing draft values', () => {
    const values = chequeDraftToFormValues(toChequeDraftFields({}))
    expect(values).toMatchObject({
      amount: 0,
      cheque_number: '',
      party_id: '',
      type: 'Outward',
      image_url: null,
    })
    expect(values.cheque_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('first incomplete step', () => {
  it('points cheques at the first step with missing required data', () => {
    const empty = toChequeDraftFields({})
    expect(firstIncompleteChequeStep(empty)).toBe(1)
    expect(
      firstIncompleteChequeStep({
        ...empty,
        amount: 10,
        cheque_number: '12345',
      }),
    ).toBe(1)
    expect(firstIncompleteChequeStep({ ...empty, amount: 10 })).toBe(1)
    expect(
      firstIncompleteChequeStep({
        ...empty,
        amount: 10,
        cheque_number: '123456',
        party_id: 'p1',
      }),
    ).toBe(2)
    expect(
      firstIncompleteChequeStep({
        ...empty,
        amount: 10,
        cheque_number: '123456',
        party_id: 'p1',
        account_id: 'a1',
      }),
    ).toBe(3)
  })

  it('points parties at the first step with missing required data', () => {
    const empty = toPartyDraftFields({})
    expect(firstIncompletePartyStep(empty)).toBe(1)
    expect(firstIncompletePartyStep({ ...empty, name: 'Acme' })).toBe(1)
    expect(
      firstIncompletePartyStep({
        ...empty,
        name: 'Acme',
        contact: '+919876543210',
      }),
    ).toBe(2)
    expect(
      firstIncompletePartyStep({
        ...empty,
        name: 'Acme',
        contact: '1234567890',
      }),
    ).toBe(1)
  })

  it('points accounts at the first step with missing required data', () => {
    const empty = toAccountDraftFields({})
    expect(firstIncompleteAccountStep(empty)).toBe(1)
    expect(firstIncompleteAccountStep({ ...empty, bank_id: 'b1' })).toBe(2)
    expect(
      firstIncompleteAccountStep({
        ...empty,
        bank_id: 'b1',
        account_name: 'Main',
        account_number: '0001',
      }),
    ).toBe(3)
  })
})
