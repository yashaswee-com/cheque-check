import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAccountRepository } from '@/features/accounts/repositories/account.repository'
import { SupabaseBankRepository } from '@/features/accounts/repositories/bank.repository'
import { SupabaseBusinessRepository } from '@/features/businesses/repositories/business.repository'
import { SupabaseChequeRepository } from '@/features/cheques/repositories/cheque.repository'
import { SupabasePartyRepository } from '@/features/parties/repositories/party.repository'
import { SupabaseTagRepository } from '@/features/tags/repositories/tag.repository'
import { SupabaseNpsRepository } from '@/features/feedback/repositories/nps.repository'
import { SupabaseMonetizationRepository } from '@/features/monetization/repositories/monetization.repository'
import { exportJobService } from '@/features/reports/services/export-job.service'
import { TagService } from '@/features/tags/services/tag.service'
import {
  premiumWorkspaceRepository,
  getMessageTemplate,
  getPrintLayout,
  savePrintLayout,
} from '@/features/premium-workspace/repositories/workspace.repository'
import { SupabaseStorageRepository } from './storage.repository'
import { TABLES } from '@/lib/supabase/tables'
import type { Account, Business, Cheque, Party, Tag } from '@/types'
import type { PrintLayout } from '@/features/cheques/lib/print-cheque'

const boundary = vi.hoisted(() => {
  const result = { data: null as unknown, error: null as unknown }
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: typeof result) => unknown) =>
      Promise.resolve(resolve({ ...result })),
    ),
  }
  const user = { id: 'user-1' }
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
  const upload = vi.fn().mockResolvedValue({ error: null })
  const storageFrom = vi.fn(() => ({ upload }))
  const from = vi.fn(() => query)
  const rpc = vi.fn(() => query)
  return { result, query, user, getUser, upload, storageFrom, from, rpc }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: boundary.from,
    rpc: boundary.rpc,
    auth: { getUser: boundary.getUser },
    storage: { from: boundary.storageFrom },
  }),
}))

// jsdom lacks Blob.arrayBuffer; keep image validation real with a readable slice.
function imageFile() {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
  const file = new File([bytes], 'image.jpg', { type: 'image/jpeg' })
  vi.spyOn(file, 'slice').mockReturnValue(
    Object.assign(new Blob([bytes]), {
      arrayBuffer: async () => bytes.buffer,
    }),
  )
  return file
}

const timestamps = { created_at: '2026-10-01', updated_at: '2026-10-02' }
const account: Account = {
  ...timestamps,
  id: 'account-1',
  business_id: 'business-1',
  bank_id: 'bank-1',
  account_name: 'Main',
  account_number: '1234',
  ifsc_code: null,
  opening_balance: 0,
  is_default: false,
}
const party: Party = {
  ...timestamps,
  id: 'party-1',
  business_id: 'business-1',
  name: 'Acme',
  contact: '+919876543210',
  email: null,
  address: null,
  notes: null,
}
const business: Business = {
  ...timestamps,
  id: 'business-1',
  user_id: 'user-1',
  name: 'Shop',
  email: null,
  phone: null,
  address: null,
  logo_url: null,
}
const cheque: Cheque = {
  ...timestamps,
  id: 'cheque-1',
  business_id: 'business-1',
  party_id: 'party-1',
  account_id: 'account-1',
  cheque_number: '123456',
  amount: 100,
  cheque_date: '2026-10-01',
  deposit_date: null,
  remind_before_days: null,
  type: 'Outward',
  status: 'Issued',
  notes: null,
  image_url: null,
}
const tag: Tag = {
  ...timestamps,
  id: 'tag-1',
  business_id: 'business-1',
  name: 'Urgent',
  color: '#ff0000',
}

beforeEach(() => {
  vi.clearAllMocks()
  boundary.result.data = []
  boundary.result.error = null
  boundary.getUser.mockResolvedValue({
    data: { user: boundary.user },
    error: null,
  })
  boundary.upload.mockResolvedValue({ error: null })
})

describe('production CRUD repositories at the Supabase boundary', () => {
  it('rejects absent cheque page metadata and preserves counts for empty result pages', async () => {
    const repository = new SupabaseChequeRepository()
    await expect(
      repository.getPage({ businessId: 'business-1' }),
    ).rejects.toThrow('Cheque page metadata was not returned')
    boundary.result.data = [
      { cheque_id: null, matching_count: 0, active_count: 8 },
    ]
    await expect(
      repository.getPage({ businessId: 'business-1' }),
    ).resolves.toEqual({ rows: [], matchingCount: 0, activeCount: 8 })
    expect(boundary.query.in).not.toHaveBeenCalled()
  })

  it('omits disappeared relations but retains authoritative page metadata', async () => {
    boundary.query.then.mockImplementationOnce((resolve) =>
      Promise.resolve(
        resolve({
          data: [{ cheque_id: 'gone', matching_count: 1, active_count: 4 }],
          error: null,
        }),
      ),
    )
    await expect(
      new SupabaseChequeRepository().getPage({ businessId: 'business-1' }),
    ).resolves.toEqual({ rows: [], matchingCount: 1, activeCount: 4 })
  })

  it('passes explicit sorting, paging, native filters, and summary ranges to RPCs', async () => {
    boundary.result.data = [
      { cheque_id: null, matching_count: 0, active_count: 0 },
    ]
    const repository = new SupabaseChequeRepository()
    await repository.getPage({
      businessId: 'business-1',
      search: 'Acme',
      sortBy: 'amount',
      sortOrder: 'asc',
      offset: 10,
      limit: 20,
      includeInward: false,
      nativeFilters: {
        search: 'Invoice',
        from: '2026-10-01',
        to: '2026-10-31',
      },
    })
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'cheque_list_page',
      expect.objectContaining({
        requested_sort: 'amount',
        requested_order: 'asc',
        requested_offset: 10,
        requested_limit: 20,
        requested_include_inward: false,
        requested_native_search: 'Invoice',
      }),
    )
    await repository.getBusinessSummaries('2026-10-31')
    expect(boundary.rpc).toHaveBeenLastCalledWith('business_cheque_summaries', {
      requested_today: '2026-10-31',
    })
    await repository.getSummary('business-1', '2026-10-31', true)
    expect(boundary.rpc).toHaveBeenLastCalledWith('cheque_summary', {
      requested_business: 'business-1',
      requested_today: '2026-10-31',
      requested_include_inward: true,
      requested_from: undefined,
      requested_to: undefined,
    })
  })

  it('paginates scoped tag maps and sorts tags within each entity', async () => {
    const tag = {
      ...timestamps,
      id: 'tag-1',
      business_id: 'business-1',
      name: 'Urgent',
      color: '#ff0000',
    }
    const firstPage = Array.from({ length: 500 }, () => ({
      entity_id: 'party-1',
      tag,
    }))
    boundary.query.then.mockImplementationOnce((resolve) =>
      Promise.resolve(resolve({ data: firstPage, error: null })),
    )
    boundary.result.data = [
      { entity_id: 'party-1', tag: { ...tag, id: 'tag-2', name: 'Alpha' } },
    ]
    const result = await new TagService(new SupabaseTagRepository()).getTagMap(
      'business-1',
      'party',
      ['party-1'],
    )
    expect(result['party-1']).toHaveLength(501)
    expect(result['party-1'][0].name).toBe('Alpha')
    expect(boundary.query.in).toHaveBeenCalledWith('entity_id', ['party-1'])
    expect(boundary.query.range).toHaveBeenLastCalledWith(500, 999)
  })

  it('lists validated export jobs and forwards request and cancellation through the production service', async () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      format: 'csv',
      status: 'queued',
      row_count: 1,
      next_part: 0,
      part_count: 1,
      created_at: '2026-10-31',
      expires_at: '2026-11-01',
      error_code: null,
    }
    boundary.result.data = [job]
    await expect(exportJobService.list('business-1')).resolves.toEqual([job])
    expect(boundary.from).toHaveBeenLastCalledWith(TABLES.REPORT_EXPORT_JOBS)
    expect(boundary.query.limit).toHaveBeenLastCalledWith(10)
    boundary.result.data = job.id
    await exportJobService.request(job.id, 'business-1', 'json', false)
    expect(boundary.rpc).toHaveBeenLastCalledWith('request_report_export', {
      requested_id: job.id,
      requested_business: 'business-1',
      requested_format: 'json',
      requested_include_inward: false,
    })
    boundary.result.data = null
    await exportJobService.cancel(job.id)
    expect(boundary.rpc).toHaveBeenLastCalledWith('cancel_report_export', {
      requested_job: job.id,
    })
  })

  it('rejects malformed joined cheque reads and nullable published fields rather than asserting a domain type', async () => {
    const repository = new SupabaseChequeRepository()
    boundary.result.data = [{ ...cheque, amount: '100' }]
    await expect(repository.getAll('business-1')).rejects.toThrow(
      'Invalid cheque relations',
    )
    boundary.result.data = { ...cheque, account: [] }
    await expect(repository.getById(cheque.id)).rejects.toThrow(
      'Invalid cheque relations',
    )
    boundary.result.data = { ...cheque, cheque_number: null }
    await expect(repository.updateStatus(cheque.id, 'Cleared')).rejects.toThrow(
      'Invalid cheque',
    )
  })
  it('fetches complete cheque history beyond the response cap using ID cursors', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      ...cheque,
      id: `cheque-${String(i).padStart(5, '0')}`,
    }))
    for (const data of [
      rows.slice(0, 500),
      rows.slice(500, 1000),
      rows.slice(1000),
    ]) {
      boundary.query.then.mockImplementationOnce((resolve) =>
        Promise.resolve(resolve({ data, error: null })),
      )
    }
    expect(await new SupabaseChequeRepository().getAll('business-1')).toEqual(
      rows,
    )
    expect(boundary.query.gt).toHaveBeenCalledWith('id', rows[499].id)
    expect(boundary.query.gt).toHaveBeenCalledWith('id', rows[999].id)
    expect(boundary.query.limit).toHaveBeenCalledWith(500)
  })

  it('fetches only selected page relations in server order and preserves complete metadata', async () => {
    boundary.query.then.mockImplementationOnce((resolve) =>
      Promise.resolve(
        resolve({
          data: [
            { cheque_id: 'second', matching_count: 10000, active_count: 10001 },
            { cheque_id: 'first', matching_count: 10000, active_count: 10001 },
          ],
          error: null,
        }),
      ),
    )
    boundary.result.data = [
      { ...cheque, id: 'first' },
      { ...cheque, id: 'second' },
    ]
    const page = await new SupabaseChequeRepository().getPage({
      businessId: 'business-1',
      search: 'Supplier',
      nativeFilters: { type: 'Outward' },
    })
    expect(page.rows.map((row) => row.id)).toEqual(['second', 'first'])
    expect(page.matchingCount).toBe(10000)
    expect(page.activeCount).toBe(10001)
    expect(boundary.query.in).toHaveBeenCalledWith('id', ['second', 'first'])
    expect(boundary.rpc).toHaveBeenCalledWith(
      'cheque_list_page',
      expect.objectContaining({
        requested_search: 'Supplier',
        requested_type: 'Outward',
        requested_limit: 50,
      }),
    )
  })
  const cases = [
    {
      table: TABLES.ACCOUNTS,
      repository: new SupabaseAccountRepository(),
      row: account,
      input: {
        business_id: account.business_id,
        bank_id: account.bank_id,
        account_name: account.account_name,
        account_number: account.account_number,
        ifsc_code: null,
        opening_balance: 0,
        is_default: false,
      },
      update: { account_name: 'Edited' },
      list: () => new SupabaseAccountRepository().getAll('business-1'),
      create: () =>
        new SupabaseAccountRepository().create({
          business_id: account.business_id,
          bank_id: account.bank_id,
          account_name: account.account_name,
          account_number: account.account_number,
          ifsc_code: null,
          opening_balance: 0,
          is_default: false,
        }),
      edit: () =>
        new SupabaseAccountRepository().update(account.id, {
          account_name: 'Edited',
        }),
    },
    {
      table: TABLES.PARTIES,
      repository: new SupabasePartyRepository(),
      row: party,
      input: {
        business_id: party.business_id,
        name: party.name,
        contact: party.contact,
        email: null,
        address: null,
        notes: null,
      },
      update: { name: 'Edited' },
      list: () => new SupabasePartyRepository().getAll('business-1'),
      create: () =>
        new SupabasePartyRepository().create({
          business_id: party.business_id,
          name: party.name,
          contact: party.contact,
          email: null,
          address: null,
          notes: null,
        }),
      edit: () =>
        new SupabasePartyRepository().update(party.id, { name: 'Edited' }),
    },
    {
      table: TABLES.CHEQUES,
      repository: new SupabaseChequeRepository(),
      row: cheque,
      input: cheque,
      update: { notes: 'Edited' },
      list: () => new SupabaseChequeRepository().getAll('business-1'),
      create: () => new SupabaseChequeRepository().create(cheque),
      edit: () =>
        new SupabaseChequeRepository().update(cheque.id, { notes: 'Edited' }),
    },
    {
      table: TABLES.BUSINESSES,
      repository: new SupabaseBusinessRepository(),
      row: business,
      input: business,
      update: { name: 'Edited' },
      list: () => new SupabaseBusinessRepository().getAll(),
      create: () => new SupabaseBusinessRepository().create(business),
      edit: () =>
        new SupabaseBusinessRepository().update(business.id, {
          name: 'Edited',
        }),
    },
  ]

  for (const entry of cases) {
    it(`${entry.table}: scopes live lists and delegates lookup, payloads and lifecycle deletion`, async () => {
      boundary.result.data = [entry.row]
      await expect(entry.list()).resolves.toEqual([entry.row])
      expect(boundary.from).toHaveBeenCalledWith(entry.table)
      expect(boundary.query.is).toHaveBeenCalledWith('deleted_at', null)
      if (entry.table !== TABLES.BUSINESSES) {
        expect(boundary.query.eq).toHaveBeenCalledWith(
          'business_id',
          'business-1',
        )
        expect(boundary.query.eq).toHaveBeenCalledWith('is_draft', false)
      }
      if (entry.table === TABLES.CHEQUES) {
        expect(boundary.query.order).toHaveBeenCalledWith('id')
        expect(boundary.query.limit).toHaveBeenCalledWith(500)
      } else
        expect(boundary.query.order).toHaveBeenCalledWith(
          entry.table === TABLES.ACCOUNTS
            ? 'account_name'
            : entry.table === TABLES.PARTIES
              ? 'name'
              : 'created_at',
          { ascending: entry.table !== TABLES.BUSINESSES },
        )
      boundary.result.data = entry.row
      await expect(entry.repository.getById(entry.row.id)).resolves.toEqual(
        entry.row,
      )
      expect(boundary.query.eq).toHaveBeenCalledWith('id', entry.row.id)
      expect(boundary.query.single).toHaveBeenCalled()
      await expect(entry.create()).resolves.toEqual(entry.row)
      expect(boundary.query.insert).toHaveBeenCalledWith([entry.input])
      await expect(entry.edit()).resolves.toEqual(entry.row)
      expect(boundary.query.update).toHaveBeenCalledWith(entry.update)
      await expect(
        entry.repository.delete(entry.row.id),
      ).resolves.toBeUndefined()
      expect(boundary.rpc).toHaveBeenCalledWith('lifecycle_delete', {
        requested_table: entry.table,
        requested_id: entry.row.id,
      })
    })

    it(`${entry.table}: maps read and mutation failures`, async () => {
      boundary.result.error = { code: '42501', message: 'Access denied' }
      await expect(entry.list()).rejects.toThrow('Access denied')
      await expect(entry.repository.delete(entry.row.id)).rejects.toThrow(
        'Access denied',
      )
    })
  }

  it('requires an authenticated business owner before inserting', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(
      new SupabaseBusinessRepository().create(business),
    ).rejects.toThrow('User not authenticated')
    expect(boundary.query.insert).not.toHaveBeenCalled()
  })

  it('writes status and a fresh timestamp for the requested cheque only', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-31T00:00:00Z'))
      boundary.result.data = { ...cheque, status: 'Cleared' }
      await expect(
        new SupabaseChequeRepository().updateStatus(cheque.id, 'Cleared'),
      ).resolves.toEqual(boundary.result.data)
      expect(boundary.query.update).toHaveBeenCalledWith({
        status: 'Cleared',
        updated_at: '2026-10-31T00:00:00.000Z',
      })
      expect(boundary.query.eq).toHaveBeenCalledWith('id', cheque.id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates an owner-scoped private bank and rejects auth failures', async () => {
    const repository = new SupabaseBankRepository()
    boundary.result.data = { id: 'bank-1', name: 'Private Bank' }
    await expect(
      repository.create({ name: 'Private Bank', country_code: 'IN' }),
    ).resolves.toEqual(boundary.result.data)
    expect(boundary.query.insert).toHaveBeenCalledWith({
      name: 'Private Bank',
      country_code: 'IN',
      owner_id: 'user-1',
      category: 'custom',
    })
    const error = new Error('Auth unavailable')
    boundary.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(repository.create({ name: 'Private Bank' })).rejects.toBe(
      error,
    )
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(repository.create({ name: 'Private Bank' })).rejects.toThrow(
      'Authentication required',
    )
  })
})

describe('tag repository', () => {
  it('bounds tag reads to the visible entity IDs and skips empty pages', async () => {
    const repository = new SupabaseTagRepository()
    expect(
      await repository.getTagsByEntity('business-1', 'cheque', []),
    ).toEqual([])
    expect(boundary.from).not.toHaveBeenCalled()
    boundary.result.data = [{ entity_id: 'cheque-1', tag }]
    expect(
      await repository.getTagsByEntity('business-1', 'cheque', ['cheque-1']),
    ).toEqual(boundary.result.data)
    expect(boundary.query.in).toHaveBeenCalledWith('entity_id', ['cheque-1'])
    expect(boundary.query.range).toHaveBeenCalledWith(0, 499)
  })
  it('reads scoped tags, usage counts, links and joined entity tags', async () => {
    const repository = new SupabaseTagRepository()
    boundary.result.data = [tag]
    await expect(repository.getAll('business-1')).resolves.toEqual([tag])
    expect(boundary.query.eq).toHaveBeenCalledWith('business_id', 'business-1')
    expect(boundary.query.is).toHaveBeenCalledWith('deleted_at', null)
    boundary.result.data = [
      {
        ...tag,
        entity_tags: [{ entity_type: 'party' }, { entity_type: 'cheque' }],
      },
      { ...tag, id: 'unused', entity_tags: null },
    ]
    await expect(repository.getAllWithUsage('business-1')).resolves.toEqual([
      { ...tag, usage_count: 2 },
      { ...tag, id: 'unused', usage_count: 0 },
    ])
    expect(boundary.query.select).toHaveBeenCalledWith(
      '*, entity_tags(entity_type)',
    )
    boundary.result.data = tag
    await expect(repository.getById(tag.id)).resolves.toEqual(tag)
    expect(boundary.query.eq).toHaveBeenCalledWith('id', tag.id)
    const link = {
      tag_id: tag.id,
      entity_type: 'party' as const,
      entity_id: party.id,
    }
    boundary.result.data = [link]
    await expect(repository.getLinks(tag.id)).resolves.toEqual([link])
    expect(boundary.query.eq).toHaveBeenCalledWith('tag_id', tag.id)
    boundary.result.data = [{ entity_id: party.id, tag }]
    await expect(
      repository.getTagsByEntity('business-1', 'party'),
    ).resolves.toEqual(boundary.result.data)
    expect(boundary.query.eq).toHaveBeenCalledWith(
      'tag.business_id',
      'business-1',
    )
    boundary.query.eq.mockClear()
    await repository.getTagsByEntity(null, 'party')
    expect(boundary.query.eq).toHaveBeenCalledExactlyOnceWith(
      'entity_type',
      'party',
    )
    boundary.result.data = [{ tag }]
    await expect(repository.getForEntity('party', party.id)).resolves.toEqual([
      tag,
    ])
    expect(boundary.query.eq).toHaveBeenCalledWith('entity_id', party.id)
  })

  it('preserves write payloads and uses transactional tag attachment RPCs', async () => {
    const repository = new SupabaseTagRepository()
    const input = {
      business_id: tag.business_id,
      name: tag.name,
      color: tag.color,
    }
    boundary.result.data = tag
    await expect(repository.create(input)).resolves.toEqual(tag)
    expect(boundary.query.insert).toHaveBeenCalledWith([input])
    await repository.update(tag.id, { name: 'Edited' })
    expect(boundary.query.update).toHaveBeenCalledWith({ name: 'Edited' })
    expect(boundary.query.eq).toHaveBeenCalledWith('id', tag.id)
    await repository.delete(tag.id)
    expect(boundary.rpc).toHaveBeenCalledWith('lifecycle_delete', {
      requested_table: TABLES.TAGS,
      requested_id: tag.id,
    })
    const link = {
      tag_id: tag.id,
      entity_type: 'party' as const,
      entity_id: party.id,
    }
    for (const attached of [true, false]) {
      await (attached ? repository.attach(link) : repository.detach(link))
      expect(boundary.rpc).toHaveBeenLastCalledWith('lifecycle_set_tag', {
        requested_tag: tag.id,
        requested_type: 'party',
        requested_entity: party.id,
        requested_attached: attached,
      })
    }
    boundary.result.error = { message: 'Link rejected' }
    await expect(repository.attach(link)).rejects.toThrow('Link rejected')
  })
})

describe('NPS and monetization repositories', () => {
  it('reads the latest feedback date, handles no feedback, and maps query errors', async () => {
    const repository = new SupabaseNpsRepository()
    boundary.result.data = { created_at: '2026-10-01T00:00:00Z' }
    await expect(repository.getLastSubmittedAt()).resolves.toEqual(
      new Date('2026-10-01T00:00:00Z'),
    )
    expect(boundary.from).toHaveBeenCalledWith(TABLES.NPS_RESPONSES)
    expect(boundary.query.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
    expect(boundary.query.limit).toHaveBeenCalledWith(1)
    boundary.result.data = null
    await expect(repository.getLastSubmittedAt()).resolves.toBeNull()
    boundary.result.error = { message: 'Query failed' }
    await expect(repository.getLastSubmittedAt()).rejects.toThrow(
      'Query failed',
    )
    boundary.result.error = null
    await repository.submit({
      score: 9,
      comment: 'Great',
      businessId: 'business-1',
      chequeId: 'cheque-1',
    })
    expect(boundary.query.insert).toHaveBeenCalledWith({
      score: 9,
      comment: 'Great',
      business_id: 'business-1',
      cheque_id: 'cheque-1',
    })
  })

  const repository = new SupabaseMonetizationRepository()
  for (const [method, table] of [
    ['getEntitlements', TABLES.USER_ENTITLEMENTS],
    ['getQuotas', TABLES.USER_QUOTAS],
    ['getTransactions', TABLES.TRANSACTIONS],
  ] as const) {
    it(`${method}: scopes authenticated reads and returns empty for missing users/data`, async () => {
      const rows = [{ id: 'owned-row', user_id: 'user-1' }]
      boundary.result.data = rows
      await expect(repository[method]()).resolves.toEqual(rows)
      expect(boundary.from).toHaveBeenCalledWith(table)
      expect(boundary.query.eq).toHaveBeenCalledWith('user_id', 'user-1')
      if (method === 'getTransactions')
        expect(boundary.query.order).toHaveBeenCalledWith('created_at', {
          ascending: false,
        })
      boundary.result.data = null
      await expect(repository[method]()).resolves.toEqual([])
      boundary.from.mockClear()
      boundary.getUser.mockResolvedValue({ data: { user: null }, error: null })
      await expect(repository[method]()).resolves.toEqual([])
      expect(boundary.from).not.toHaveBeenCalled()
    })
  }
})

describe('premium workspace repository', () => {
  const layout: PrintLayout = {
    payeeX: 1,
    payeeY: 2,
    amountX: 3,
    amountY: 4,
    dateX: 5,
    dateY: 6,
    chequeNumberX: 7,
    chequeNumberY: 8,
  }

  it('loads live context and saved tools in deterministic pages', async () => {
    boundary.result.data = []
    await expect(
      premiumWorkspaceRepository.context('business-1'),
    ).resolves.toEqual({
      parties: [],
      accounts: [],
      cheques: [],
    })
    for (const table of [TABLES.PARTIES, TABLES.ACCOUNTS, TABLES.CHEQUES])
      expect(boundary.from).toHaveBeenCalledWith(table)
    expect(boundary.query.eq).toHaveBeenCalledWith('business_id', 'business-1')
    expect(boundary.query.eq).toHaveBeenCalledWith('is_draft', false)
    expect(boundary.query.is).toHaveBeenCalledWith('deleted_at', null)
    expect(boundary.query.range).toHaveBeenCalledWith(0, 499)
    const firstPage = Array.from({ length: 500 }, (_, id) => ({
      id: String(id),
    }))
    boundary.query.then.mockImplementationOnce((resolve) =>
      Promise.resolve(resolve({ data: firstPage, error: null })),
    )
    await expect(
      premiumWorkspaceRepository.tools('business-1'),
    ).resolves.toEqual(firstPage)
    expect(boundary.from).toHaveBeenCalledWith(TABLES.PREMIUM_WORKSPACE_TOOLS)
    expect(boundary.query.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    })
    expect(boundary.query.range).toHaveBeenLastCalledWith(500, 999)
  })

  it('sends precise tool, import, bulk-status and snapshot RPC payloads', async () => {
    boundary.result.data = { id: 'tool-1' }
    await expect(
      premiumWorkspaceRepository.saveTool(
        'business-1',
        'message-template',
        'Greeting',
        { template: 'Hi' },
      ),
    ).resolves.toEqual(boundary.result.data)
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_save_tool',
      {
        requested_business: 'business-1',
        requested_kind: 'message-template',
        requested_name: 'Greeting',
        requested_payload: { template: 'Hi' },
      },
    )
    await premiumWorkspaceRepository.saveTool(
      'business-1',
      'message-template',
      'Greeting',
      {},
      'tool-1',
    )
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_save_tool',
      expect.objectContaining({ requested_id: 'tool-1' }),
    )
    await premiumWorkspaceRepository.applyTool('tool-1')
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_apply_tool',
      { requested_id: 'tool-1' },
    )
    await premiumWorkspaceRepository.deleteTool('tool-1')
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_delete_tool',
      { requested_id: 'tool-1' },
    )
    boundary.result.data = 1
    const rows = [{ name: 'Acme', contact: '+919876543210' }]
    await expect(
      premiumWorkspaceRepository.importRows('business-1', 'parties', rows),
    ).resolves.toBe(1)
    expect(boundary.rpc).toHaveBeenLastCalledWith('premium_workspace_import', {
      requested_business: 'business-1',
      requested_kind: 'parties',
      requested_rows: rows,
    })
    await expect(
      premiumWorkspaceRepository.bulkStatus(
        'business-1',
        ['cheque-1'],
        'Cleared',
      ),
    ).resolves.toBe(1)
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_bulk_status',
      {
        requested_business: 'business-1',
        requested_ids: ['cheque-1'],
        requested_status: 'Cleared',
      },
    )
    boundary.result.data = { businesses: [], cheques: [] }
    await premiumWorkspaceRepository.snapshot(['business-1'])
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_snapshot',
      { requested_businesses: ['business-1'] },
    )
    await premiumWorkspaceRepository.snapshot(
      ['business-1'],
      'party-1',
      '2026-10-01',
      '2026-10-31',
    )
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_snapshot',
      {
        requested_businesses: ['business-1'],
        requested_party: 'party-1',
        requested_from: '2026-10-01',
        requested_to: '2026-10-31',
      },
    )
    boundary.result.error = { message: 'Premium expired' }
    await expect(
      premiumWorkspaceRepository.applyTool('tool-1'),
    ).rejects.toThrow('Premium expired')
  })

  it('reads nullable templates/layouts and writes layouts, propagating entitlement failures', async () => {
    boundary.result.data = 'Hello'
    await expect(getMessageTemplate('business-1')).resolves.toBe('Hello')
    expect(boundary.rpc).toHaveBeenLastCalledWith('premium_workspace_message', {
      requested_business: 'business-1',
    })
    boundary.result.data = null
    await expect(getMessageTemplate()).resolves.toBeNull()
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_message',
      {},
    )
    await expect(getPrintLayout('account-1')).resolves.toBeNull()
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_print_layout',
      { requested_account: 'account-1' },
    )
    boundary.result.data = layout
    await expect(getPrintLayout('account-1')).resolves.toEqual(layout)
    await savePrintLayout('account-1', layout)
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'premium_workspace_print_layout',
      { requested_account: 'account-1', requested_layout: layout },
    )
    boundary.result.error = { message: 'Premium expired' }
    await expect(getMessageTemplate()).rejects.toThrow('Premium expired')
    await expect(getPrintLayout('account-1')).rejects.toThrow('Premium expired')
    await expect(savePrintLayout('account-1', layout)).rejects.toThrow(
      'Premium expired',
    )
  })
})

describe('private storage repository', () => {
  it('uploads validated images into user-owned paths with non-overwriting options', async () => {
    const repository = new SupabaseStorageRepository()
    const file = imageFile()
    for (const [method, bucket] of [
      ['uploadChequeImage', 'private-cheque-images'],
      ['uploadAvatar', 'private-avatars'],
    ] as const) {
      const url = await repository[method](file)
      expect(boundary.storageFrom).toHaveBeenLastCalledWith(bucket)
      expect(boundary.upload).toHaveBeenLastCalledWith(
        expect.stringMatching(/^user-1\/[a-f0-9-]+\.jpg$/),
        file,
        { contentType: 'image/jpeg', upsert: false },
      )
      expect(url).toBe(
        `/api/storage/${bucket}/${boundary.upload.mock.lastCall?.[0]}`,
      )
    }
    boundary.storageFrom.mockClear()
    await repository.deleteAvatar('/api/storage/private-avatars/retained.jpg')
    await repository.deleteChequeImage(
      '/api/storage/private-cheque-images/retained.jpg',
    )
    expect(boundary.storageFrom).not.toHaveBeenCalled()
  })

  it('rejects invalid images, unauthenticated uploads and mapped external failures', async () => {
    const repository = new SupabaseStorageRepository()
    await expect(
      repository.uploadAvatar(new File([], 'empty.jpg')),
    ).rejects.toThrow('empty')
    expect(boundary.getUser).not.toHaveBeenCalled()
    const file = imageFile()
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(repository.uploadAvatar(file)).rejects.toThrow('Sign in')
    boundary.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth failed' },
    })
    await expect(repository.uploadChequeImage(file)).rejects.toThrow(
      'Auth failed',
    )
    boundary.getUser.mockResolvedValue({
      data: { user: boundary.user },
      error: null,
    })
    boundary.upload.mockResolvedValue({ error: { message: 'Upload failed' } })
    await expect(repository.uploadAvatar(file)).rejects.toThrow('Upload failed')
  })
})
