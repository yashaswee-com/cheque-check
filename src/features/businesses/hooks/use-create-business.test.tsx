import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business } from '@/types'
import { useCreateBusiness } from './use-create-business'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  setActiveBusiness: vi.fn(),
  push: vi.fn(),
  celebrate: vi.fn(),
}))

vi.mock('@/features/businesses/services/business.service', () => ({
  businessService: { create: mocks.create },
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ setActiveBusiness: mocks.setActiveBusiness }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/lib/celebrate', () => ({
  queueCelebration: mocks.celebrate,
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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCreateBusiness(), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.create.mockResolvedValue(business)
})

afterEach(cleanup)

describe('useCreateBusiness', () => {
  it('validates the wizard, creates a business, activates it, and navigates after success', async () => {
    const onCreated = vi.fn()
    const { result } = renderHook(() => useCreateBusiness({ onCreated }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
    })

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(1)
    act(() => result.current.form.setValue('name', 'Acme'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(2)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme',
        email: null,
        phone: null,
        address: null,
        logo_url: null,
      }),
    )
    expect(mocks.setActiveBusiness).toHaveBeenCalledWith(business)
    expect(mocks.celebrate).toHaveBeenCalledWith({ target: '/businesses' })
    expect(onCreated).toHaveBeenCalledWith(business)
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.push).toHaveBeenCalledWith('/businesses')
  })

  it('accepts valid contact details on the second wizard step', async () => {
    const { result } = setup()
    act(() => {
      result.current.form.setValue('name', 'Acme')
      result.current.form.setValue('email', 'team@example.com')
      result.current.form.setValue('phone', '+14155550123')
    })

    await act(async () => result.current.nextStep())
    await act(async () => result.current.nextStep())

    expect(result.current.step).toBe(3)
  })
})
