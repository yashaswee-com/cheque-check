import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  SupabaseAccountDraftRepository,
  SupabaseChequeDraftRepository,
  SupabasePartyDraftRepository,
  type IChequeDraftRepository,
  type PublishedChequeInput,
} from './draft.repository'
import type { Cheque } from '@/types'
import { createClient } from '@/lib/supabase/client'
import {
  accountDraftFixture,
  chequeDraftFixture,
  partyDraftFixture,
} from '@/test/draft-fixtures'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => mocks) }))
let data: unknown
let error: unknown
const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  then: (resolve: (result: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve({ data, error })),
}
beforeEach(() => {
  vi.clearAllMocks()
  data = partyDraftFixture
  error = null
  mocks.from.mockReturnValue(query)
  mocks.rpc.mockResolvedValue({
    data: { ...chequeDraftFixture, id: 'copy' },
    error: null,
  })
})

describe('draft repositories', () => {
  it('uses an injected client across specialized draft adapters', async () => {
    const client = createClient()
    vi.mocked(createClient).mockClear()
    data = []
    await new SupabaseChequeDraftRepository(client).list('b1')
    await new SupabasePartyDraftRepository(client).list('b1')
    await new SupabaseAccountDraftRepository(client).list('b1')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('binds publication to the cheque input and persisted return type', () => {
    expectTypeOf<IChequeDraftRepository['publish']>().toEqualTypeOf<
      (id: string, values: PublishedChequeInput) => Promise<Cheque>
    >()
    expectTypeOf<
      'deleted_at' extends keyof PublishedChequeInput ? true : false
    >().toEqualTypeOf<false>()
    expectTypeOf<
      'is_draft' extends keyof PublishedChequeInput ? true : false
    >().toEqualTypeOf<false>()
  })
  it.each([
    [SupabaseChequeDraftRepository, 'cheques', chequeDraftFixture],
    [SupabasePartyDraftRepository, 'parties', partyDraftFixture],
    [SupabaseAccountDraftRepository, 'accounts', accountDraftFixture],
  ] as const)(
    'lists only active drafts in %s',
    async (Repository, table, fixture) => {
      data = [fixture]
      await expect(new Repository().list('b1')).resolves.toEqual(data)
      expect(mocks.from).toHaveBeenCalledWith(table)
      expect(query.eq.mock.calls).toEqual([
        ['business_id', 'b1'],
        ['is_draft', true],
      ])
      expect(query.is).toHaveBeenCalledWith('deleted_at', null)
      expect(query.order).toHaveBeenCalledWith('updated_at', {
        ascending: false,
      })
    },
  )

  it('creates drafts with trusted business identity and draft status', async () => {
    const repository = new SupabasePartyDraftRepository()
    await expect(repository.create('b1', { name: 'Asha' })).resolves.toEqual(
      partyDraftFixture,
    )
    expect(query.insert).toHaveBeenCalledWith([
      { name: 'Asha', business_id: 'b1', is_draft: true },
    ])
    expect(query.single).toHaveBeenCalledOnce()
  })

  it('updates only the requested draft and stamps the update time', async () => {
    await new SupabasePartyDraftRepository().update('d1', { name: 'Updated' })
    expect(query.update).toHaveBeenCalledWith({
      name: 'Updated',
      updated_at: expect.any(String),
    })
    expect(query.eq.mock.calls).toEqual([
      ['id', 'd1'],
      ['is_draft', true],
    ])
  })

  it('verifies draft ownership/visibility before lifecycle deletion', async () => {
    await new SupabasePartyDraftRepository().delete('d1')
    expect(query.eq.mock.calls).toEqual([
      ['id', 'd1'],
      ['is_draft', true],
    ])
    expect(query.is).toHaveBeenCalledWith('deleted_at', null)
    expect(mocks.rpc).toHaveBeenCalledWith('lifecycle_delete', {
      requested_table: 'parties',
      requested_id: 'd1',
    })
  })

  it('does not delete a missing draft or hide database failures', async () => {
    data = null
    await expect(
      new SupabasePartyDraftRepository().delete('missing'),
    ).rejects.toThrow('No data returned')
    expect(mocks.rpc).not.toHaveBeenCalled()
    error = { message: 'permission denied', code: '42501' }
    await expect(
      new SupabasePartyDraftRepository().list('b1'),
    ).rejects.toThrow()
  })

  it('publishes a draft in place without inserting a second record', async () => {
    data = {
      id: 'd1',
      business_id: 'b1',
      name: 'Asha',
      contact: '+919876543210',
      email: null,
      address: null,
      notes: null,
      created_at: '',
      updated_at: '',
    }
    await new SupabasePartyDraftRepository().publish('d1', {
      name: 'Asha',
      contact: '+919876543210',
      email: null,
      address: null,
      notes: null,
    })
    expect(query.update).toHaveBeenCalledWith({
      name: 'Asha',
      contact: '+919876543210',
      email: null,
      address: null,
      notes: null,
      is_draft: false,
      updated_at: expect.any(String),
    })
    expect(query.eq.mock.calls).toEqual([
      ['id', 'd1'],
      ['is_draft', true],
    ])
    expect(query.insert).not.toHaveBeenCalled()
  })

  it('duplicates a cheque through the authorized RPC', async () => {
    await expect(
      new SupabaseChequeDraftRepository().duplicate('c1'),
    ).resolves.toEqual({ ...chequeDraftFixture, id: 'copy' })
    expect(mocks.rpc).toHaveBeenCalledWith('duplicate_cheque_draft', {
      requested_cheque: 'c1',
    })
  })

  it.each([{ rows: [] }, { rows: [{ id: 'conflict' }] }])(
    'detects published cheque-number conflicts: $rows',
    async ({ rows }) => {
      data = rows
      await expect(
        new SupabaseChequeDraftRepository().hasNumberConflict(
          'b1',
          'a1',
          '000001',
        ),
      ).resolves.toBe(rows.length > 0)
      expect(query.eq.mock.calls).toEqual([
        ['business_id', 'b1'],
        ['account_id', 'a1'],
        ['cheque_number', '000001'],
        ['is_draft', false],
      ])
      expect(query.limit).toHaveBeenCalledWith(1)
      expect(query.neq).not.toHaveBeenCalled()
    },
  )

  it('excludes the cheque being edited from number conflicts', async () => {
    data = []
    await expect(
      new SupabaseChequeDraftRepository().hasNumberConflict(
        'b1',
        'a1',
        '000001',
        'c1',
      ),
    ).resolves.toBe(false)
    expect(query.neq).toHaveBeenCalledExactlyOnceWith('id', 'c1')
    expect(query.limit).toHaveBeenCalledWith(1)
  })

  it('rejects malformed database drafts and published rows', async () => {
    data = { id: 'd1' }
    await expect(
      new SupabasePartyDraftRepository().getById('d1'),
    ).rejects.toThrow('Invalid draft')
    await expect(
      new SupabasePartyDraftRepository().publish('d1', {
        name: 'Asha',
        contact: '+919876543210',
        email: null,
        address: null,
        notes: null,
      }),
    ).rejects.toThrow('Invalid published draft')
    mocks.rpc.mockResolvedValue({ data: { id: 'copy' }, error: null })
    await expect(
      new SupabaseChequeDraftRepository().duplicate('d1'),
    ).rejects.toThrow('Invalid duplicated')
  })
})
