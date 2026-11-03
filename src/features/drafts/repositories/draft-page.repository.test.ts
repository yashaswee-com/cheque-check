import { beforeEach, describe, expect, it, vi } from 'vitest'
import { draftPageRepository } from './draft-page.repository'

const business = '30000000-0000-4000-8000-000000000001'
const draftId = '30000000-0000-4000-8000-000000000002'
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}))

const request = {
  businessId: business,
  types: [] as ('cheque' | 'party' | 'account')[],
  search: '',
  ascending: false,
  page: 0,
}

beforeEach(() => {
  mocks.rpc.mockReset()
})

describe('draftPageRepository.list', () => {
  it('maps the request to the RPC and parses the page', async () => {
    const page = {
      items: [
        {
          entity: 'party',
          draft: {
            id: draftId,
            business_id: business,
            updated_at: '2026-01-01T00:00:00Z',
            name: 'Acme',
          },
        },
      ],
      total: 1,
      page: 0,
      page_size: 50,
    }
    mocks.rpc.mockResolvedValue({ data: page, error: null })
    await expect(
      draftPageRepository.list({
        ...request,
        types: ['party'],
        search: '  acme ',
        ascending: true,
        page: 2,
      }),
    ).resolves.toEqual(page)
    expect(mocks.rpc).toHaveBeenCalledWith('list_drafts_page', {
      requested_business: business,
      requested_types: ['party'],
      requested_search: 'acme',
      requested_ascending: true,
      requested_page: 2,
    })
  })

  it('omits empty filters so the RPC returns every type', async () => {
    mocks.rpc.mockResolvedValue({
      data: { items: [], total: 0, page: 0, page_size: 50 },
      error: null,
    })
    await draftPageRepository.list({ ...request, search: '   ' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_drafts_page',
      expect.objectContaining({
        requested_types: undefined,
        requested_search: undefined,
      }),
    )
  })

  it.each([
    { businessId: 'nope' },
    { page: -1 },
    { page: 200 },
    { search: 'x'.repeat(101) },
    { types: ['invoice'] },
  ])(
    'rejects invalid requests without calling the server (%o)',
    async (bad) => {
      await expect(
        draftPageRepository.list({ ...request, ...bad } as typeof request),
      ).rejects.toThrow('Invalid draft filters')
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )

  it('rejects malformed responses and surfaces server errors', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        items: [{ entity: 'invoice', draft: {} }],
        total: 1,
        page: 0,
        page_size: 50,
      },
      error: null,
    })
    await expect(draftPageRepository.list(request)).rejects.toThrow()
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Authentication required' },
    })
    await expect(draftPageRepository.list(request)).rejects.toThrow(
      'Authentication required',
    )
  })
})

describe('draftPageRepository.counts', () => {
  it('returns per-type counts', async () => {
    mocks.rpc.mockResolvedValue({
      data: { cheque: 2, party: 0, account: 1 },
      error: null,
    })
    await expect(draftPageRepository.counts(business)).resolves.toEqual({
      cheque: 2,
      party: 0,
      account: 1,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('draft_counts', {
      requested_business: business,
    })
  })

  it('validates the business and the response', async () => {
    await expect(draftPageRepository.counts('nope')).rejects.toThrow(
      'Invalid business',
    )
    mocks.rpc.mockResolvedValue({ data: { cheque: -1 }, error: null })
    await expect(draftPageRepository.counts(business)).rejects.toThrow()
  })
})
