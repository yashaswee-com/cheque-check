import { describe, expect, it } from 'vitest'
import { parseDatabaseValue } from '@/repositories/base.repository'
import { DatabaseError } from '@/lib/errors'
import { persistedChequeSchema, relatedChequeSchema } from './persisted-cheque'
import { printLayoutSchema, workspaceSnapshotSchema } from './premium-workspace'
import type { Cheque, ChequeWithRelations } from '@/types'
import type { WorkspaceSnapshot } from '@/features/premium-workspace/types'
import type { PrintLayout } from '@/features/cheques/lib/print-cheque'

const cheque = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '123456',
  amount: 100,
  cheque_date: '2026-10-31',
  deposit_date: null,
  remind_before_days: null,
  status: 'Issued',
  type: 'Outward',
  notes: null,
  image_url: null,
  is_draft: false,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  deletion_batch_id: null,
}
const layout = {
  payeeX: 35,
  payeeY: 55,
  amountX: 150,
  amountY: 55,
  dateX: 165,
  dateY: 25,
  chequeNumberX: 165,
  chequeNumberY: 35,
}

describe('validated persistence contracts', () => {
  it('produces domain-compatible cheques without type assertions', () => {
    const row: Cheque = parseDatabaseValue(
      cheque,
      persistedChequeSchema,
      'cheque',
    )
    expect(row).toEqual(cheque)
    const related: ChequeWithRelations = parseDatabaseValue(
      {
        ...cheque,
        party: {
          name: 'Acme',
          contact: null,
          color: null,
          icon: null,
          avatar_url: null,
        },
        account: {
          account_name: 'Main',
          color: null,
          icon: null,
          bank: { name: 'Bank', logo_url: null },
        },
      },
      relatedChequeSchema,
      'cheque relations',
    )
    expect(related.party?.color).toBeUndefined()
    expect(related.account?.bank?.name).toBe('Bank')
  })
  it('handles absent relations and rejects an unexpected relation array', () => {
    const row = parseDatabaseValue(
      { ...cheque, party: null, account: null },
      relatedChequeSchema,
      'cheque relations',
    )
    expect(row.party).toBeUndefined()
    expect(row.account).toBeUndefined()
    expect(() =>
      parseDatabaseValue(
        { ...cheque, account: [] },
        relatedChequeSchema,
        'cheque relations',
      ),
    ).toThrow(DatabaseError)
    const noBank = relatedChequeSchema.parse({
      ...cheque,
      account: { account_name: 'Main', bank: null },
    })
    expect(noBank.account?.bank).toBeUndefined()
  })
  it.each([
    { amount: null },
    { amount: '100' },
    { amount: Infinity },
    { status: 'Unsupported' },
    { cheque_date: null },
    { is_draft: true },
    { deleted_at: '2026-10-31' },
    { account_id: null },
  ])('rejects malformed or unpublished domain data: %j', (fields) => {
    expect(() =>
      parseDatabaseValue(
        { ...cheque, ...fields },
        persistedChequeSchema,
        'cheque',
      ),
    ).toThrow('Invalid cheque returned from the database')
  })
  it('validates every nested snapshot row and preserves nullable database fields', () => {
    const snapshot: WorkspaceSnapshot = parseDatabaseValue(
      {
        businesses: [{ id: 'b1', name: 'Acme' }],
        cheques: [{ ...cheque, party_id: null, created_at: null }],
      },
      workspaceSnapshotSchema,
      'workspace snapshot',
    )
    expect(snapshot.cheques[0].party_id).toBeNull()
    expect(snapshot.cheques[0].created_at).toBeNull()
    expect(() =>
      parseDatabaseValue(
        { businesses: [], cheques: [cheque, { ...cheque, amount: 'bad' }] },
        workspaceSnapshotSchema,
        'workspace snapshot',
      ),
    ).toThrow(DatabaseError)
    expect(() =>
      parseDatabaseValue(
        { businesses: [], cheques: null },
        workspaceSnapshotSchema,
        'workspace snapshot',
      ),
    ).toThrow(DatabaseError)
  })
  it('enforces the same eight numeric A4 coordinates as the print-layout RPC', () => {
    const result: PrintLayout = parseDatabaseValue(
      layout,
      printLayoutSchema,
      'print layout',
    )
    expect(result).toEqual(layout)
    for (const value of [
      { ...layout, payeeX: 211 },
      { ...layout, payeeY: 298 },
      { ...layout, dateX: -1 },
      { ...layout, amountX: '150' },
      { ...layout, extra: 1 },
      {},
    ]) {
      expect(() =>
        parseDatabaseValue(value, printLayoutSchema, 'print layout'),
      ).toThrow(DatabaseError)
    }
  })
})
