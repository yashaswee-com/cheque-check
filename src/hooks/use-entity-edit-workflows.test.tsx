import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditBusiness } from '@/features/businesses/hooks/use-edit-business'
import { useEditAccount } from '@/features/accounts/hooks/use-edit-account'
import { useEditParty } from '@/features/parties/hooks/use-edit-party'
import { queryKeys } from '@/lib/query-keys'

const mocks = vi.hoisted(() => ({
  business: { getById: vi.fn(), update: vi.fn(), delete: vi.fn() },
  account: { getById: vi.fn(), update: vi.fn(), delete: vi.fn() },
  party: { getById: vi.fn(), update: vi.fn(), delete: vi.fn() },
  back: vi.fn(),
  push: vi.fn(),
  deleteAvatar: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/features/businesses/services/business.service', () => ({
  businessService: mocks.business,
}))
vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: mocks.account,
}))
vi.mock('@/features/parties/services/party.service', () => ({
  partyService: mocks.party,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))
vi.mock('@/services/storage.service', () => ({
  storageService: { deleteAvatar: mocks.deleteAvatar },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))

const business = {
  id: 'b1',
  name: 'Original',
  email: null,
  phone: null,
  address: null,
  color: null,
  icon: null,
  logo_url: '/old.png',
}
const account = {
  id: 'a1',
  bank_id: 'bank1',
  account_name: 'Original',
  account_number: '111',
  ifsc_code: null,
  color: '#007AFF',
  notes: null,
  opening_balance: 0,
  is_default: false,
}
const party = {
  id: 'p1',
  name: 'Original',
  contact: '+919876543210',
  email: null,
  address: null,
  notes: null,
  color: '#007AFF',
  avatar_url: null,
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.business.getById.mockResolvedValue(business)
  mocks.account.getById.mockResolvedValue(account)
  mocks.party.getById.mockResolvedValue(party)
  mocks.business.update.mockResolvedValue(business)
  mocks.account.update.mockResolvedValue(account)
  mocks.party.update.mockResolvedValue(party)
  mocks.business.delete.mockResolvedValue(undefined)
  mocks.account.delete.mockResolvedValue(undefined)
  mocks.party.delete.mockResolvedValue(undefined)
  mocks.deleteAvatar.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('entity edit workflows', () => {
  it('hydrates business defaults once, preserves user edits on refetch, and cleans up replaced logos', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.businesses.all(), [business])
    const { result } = renderHook(() => useEditBusiness('b1'), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() =>
      expect(result.current.form.getValues('name')).toBe('Original'),
    )
    expect(result.current.form.getValues('icon')).toBe('Store')
    expect(result.current.form.getValues('email')).toBe('')
    act(() => result.current.form.setValue('name', 'Edited'))
    act(() =>
      client.setQueryData(queryKeys.businesses.detail('b1'), {
        ...business,
        name: 'Remote',
      }),
    )
    await waitFor(() => expect(result.current.business?.name).toBe('Remote'))
    expect(result.current.form.getValues('name')).toBe('Edited')
    act(() => result.current.form.setValue('logo_url', '/new.png'))
    mocks.deleteAvatar.mockRejectedValueOnce(new Error('cleanup failed'))
    await act(async () => result.current.onSubmit())
    expect(mocks.business.update).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ name: 'Edited', logo_url: '/new.png' }),
    )
    expect(mocks.deleteAvatar).toHaveBeenCalledWith('/old.png')
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to delete previous business logo',
      expect.any(Error),
    )
    expect(mocks.back).toHaveBeenCalledOnce()
  })
  it('hydrates accounts, validates edits, updates the matching cached entity, and navigates after save', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.accounts.list('b1'), [
      account,
      { ...account, id: 'a2' },
    ])
    const { result } = renderHook(() => useEditAccount('a1', 'b1'), { wrapper })
    await waitFor(() =>
      expect(result.current.form.getValues('account_name')).toBe('Original'),
    )
    expect(result.current.form.getValues('ifsc_code')).toBe('')
    act(() => result.current.form.setValue('account_name', 'Changed'))
    await act(async () => result.current.onSubmit())
    expect(mocks.account.update).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ account_name: 'Changed' }),
    )
    expect(
      client
        .getQueryData<Record<string, unknown>[]>(queryKeys.accounts.list('b1'))
        ?.map(({ account_name }) => account_name),
    ).toEqual(['Changed', 'Original'])
    expect(mocks.back).toHaveBeenCalledOnce()
    act(() => result.current.onDelete())
    await waitFor(() => expect(mocks.account.delete).toHaveBeenCalledWith('a1'))
    expect(mocks.push).toHaveBeenCalledWith('/accounts')
  })
  it('hydrates parties and rolls back a failed update without navigating', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.parties.list('b1'), [party])
    const { result } = renderHook(() => useEditParty('p1', 'b1'), { wrapper })
    await waitFor(() =>
      expect(result.current.form.getValues('name')).toBe('Original'),
    )
    expect(result.current.form.getValues('avatar_url')).toBeNull()
    act(() => result.current.form.setValue('name', 'Changed'))
    mocks.party.update.mockRejectedValueOnce(new Error('update failed'))
    await act(async () => {
      await expect(result.current.onSubmit()).rejects.toThrow('update failed')
    })
    expect(client.getQueryData(queryKeys.parties.list('b1'))).toEqual([party])
    expect(mocks.back).not.toHaveBeenCalled()
    await act(async () => result.current.onSubmit())
    expect(mocks.party.update).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ name: 'Changed' }),
    )
    expect(mocks.back).toHaveBeenCalledOnce()
    act(() => result.current.onDelete())
    await waitFor(() => expect(mocks.party.delete).toHaveBeenCalledWith('p1'))
    expect(mocks.push).toHaveBeenCalledWith('/parties')
  })
  it('exposes fetch failures and deletes businesses through optimistic mutation', async () => {
    const { client, wrapper } = setup()
    mocks.business.getById.mockRejectedValueOnce(new Error('not found'))
    client.setQueryData(queryKeys.businesses.all(), [business])
    const { result } = renderHook(() => useEditBusiness('b1'), { wrapper })
    await waitFor(() => expect(result.current.error?.message).toBe('not found'))
    act(() => result.current.onDelete())
    await waitFor(() =>
      expect(mocks.business.delete).toHaveBeenCalledWith('b1'),
    )
    expect(client.getQueryData(queryKeys.businesses.all())).toEqual([])
    expect(mocks.push).toHaveBeenCalledWith('/businesses')
  })
})
