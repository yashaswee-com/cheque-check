import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { useEditBusiness } from './use-edit-business'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  deleteAvatar: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/features/businesses/services/business.service', () => ({
  businessService: {
    getById: mocks.getById,
    update: mocks.update,
    delete: mocks.remove,
  },
}))
vi.mock('@/services/storage.service', () => ({
  storageService: { deleteAvatar: mocks.deleteAvatar },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.logError } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))

const business: Business = {
  id: 'business-1',
  user_id: 'user-1',
  name: 'Acme',
  email: null,
  phone: null,
  address: null,
  logo_url: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}
const other: Business = {
  ...business,
  id: 'business-2',
  name: 'Other',
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.businesses.all(), [business, other])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useEditBusiness(business.id), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(business)
  mocks.update.mockResolvedValue(business)
  mocks.remove.mockResolvedValue(undefined)
  mocks.deleteAvatar.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('useEditBusiness', () => {
  it('normalizes missing optional fields and updates only the matching cached business', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.business?.id).toBe(business.id))
    expect(result.current.form.getValues()).toMatchObject({
      email: '',
      phone: '',
      address: '',
      color: '#007AFF',
      icon: 'Store',
      logo_url: null,
    })

    act(() => result.current.form.setValue('name', 'Acme Updated'))
    await act(async () => result.current.onSubmit())

    expect(mocks.update).toHaveBeenCalledWith(
      business.id,
      expect.objectContaining({ name: 'Acme Updated' }),
    )
    expect(mocks.deleteAvatar).not.toHaveBeenCalled()
    expect(mocks.back).toHaveBeenCalledOnce()
  })

  it('deletes a changed previous logo and navigates after delete', async () => {
    const previous = { ...business, logo_url: '/old-logo.png' }
    mocks.getById.mockResolvedValue(previous)
    const { result } = setup()
    await waitFor(() =>
      expect(result.current.business?.logo_url).toBe(previous.logo_url),
    )
    act(() => result.current.form.setValue('logo_url', '/new-logo.png'))
    await act(async () => result.current.onSubmit())

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('/old-logo.png')
    act(() => result.current.onDelete())
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(business.id))
    expect(mocks.push).toHaveBeenCalledWith('/businesses')
  })
})
