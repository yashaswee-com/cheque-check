import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Party } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { useEditParty } from './use-edit-party'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/features/parties/services/party.service', () => ({
  partyService: {
    getById: mocks.getById,
    update: mocks.update,
    delete: mocks.remove,
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))

const party: Party = {
  id: 'party-1',
  business_id: 'business-1',
  name: 'Acme',
  contact: '+14155550123',
  email: null,
  address: null,
  notes: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}
const other: Party = { ...party, id: 'party-2', name: 'Other' }

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.parties.list('business-1'), [party, other])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useEditParty(party.id, party.business_id), {
    wrapper,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(party)
  mocks.update.mockResolvedValue(party)
  mocks.remove.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('useEditParty', () => {
  it('normalizes optional party fields and updates the matching list item', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.party?.id).toBe(party.id))
    expect(result.current.form.getValues()).toMatchObject({
      email: '',
      address: '',
      notes: '',
      avatar_url: null,
    })
    act(() => result.current.form.setValue('name', 'Acme Updated'))
    await act(async () => result.current.onSubmit())

    expect(mocks.update).toHaveBeenCalledWith(
      party.id,
      expect.objectContaining({ name: 'Acme Updated' }),
    )
    expect(mocks.back).toHaveBeenCalledOnce()
  })

  it('deletes a party and navigates to the party list', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.party?.id).toBe(party.id))
    act(() => result.current.onDelete())

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(party.id))
    expect(mocks.push).toHaveBeenCalledWith('/parties')
  })
})
