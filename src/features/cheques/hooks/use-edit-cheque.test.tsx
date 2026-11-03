import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditCheque } from './use-edit-cheque'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  toast: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: {
    getById: mocks.getById,
    update: mocks.update,
    delete: mocks.remove,
  },
}))
vi.mock('@/services/storage.service', () => ({
  storageService: { uploadChequeImage: mocks.upload },
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))
vi.mock('@/features/profile/hooks/use-display-format', () => ({
  useFormattingPreferences: () => ({ time_zone: 'UTC' }),
}))

const cheque = {
  id: 'cheque-1',
  business_id: 'business-1',
  cheque_number: '000123',
  amount: 500,
  cheque_date: '2026-11-01',
  deposit_date: '2026-11-10',
  party_id: 'party-1',
  account_id: 'account-1',
  type: 'Outward',
  notes: null,
  image_url: null,
}

function setup(options?: Parameters<typeof useEditCheque>[1]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useEditCheque(cheque.id, options), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(cheque)
  mocks.update.mockResolvedValue(cheque)
})
afterEach(cleanup)

describe('useEditCheque', () => {
  it('loads the cheque into a clean form and navigates back after saving', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.cheque?.id).toBe(cheque.id))
    expect(result.current.form.getValues()).toMatchObject({
      deposit_date: '2026-11-10',
      notes: '',
      image_url: null,
    })
    expect(result.current.form.formState.isDirty).toBe(false)

    act(() =>
      result.current.form.setValue('notes', 'Updated', { shouldDirty: true }),
    )
    await act(async () => result.current.onSubmit())
    expect(mocks.update).toHaveBeenCalledWith(
      cheque.id,
      expect.objectContaining({ notes: 'Updated' }),
    )
    expect(mocks.back).toHaveBeenCalledOnce()
  })

  it('runs the onSaved callback instead of navigating back', async () => {
    const onSaved = vi.fn()
    const { result } = setup({ onSaved })
    await waitFor(() => expect(result.current.cheque?.id).toBe(cheque.id))
    await act(async () => result.current.onSubmit())
    expect(onSaved).toHaveBeenCalledOnce()
    expect(mocks.back).not.toHaveBeenCalled()
  })

  it('reports a failed save and stays on the page', async () => {
    const onSaved = vi.fn()
    mocks.update.mockRejectedValueOnce(new Error('offline'))
    const { result } = setup({ onSaved })
    await waitFor(() => expect(result.current.cheque?.id).toBe(cheque.id))
    await act(async () => result.current.onSubmit())
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'offline', type: 'error' }),
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('marks the form dirty when a new photo is uploaded', async () => {
    mocks.upload.mockResolvedValueOnce('photo-url')
    const { result } = setup()
    await waitFor(() => expect(result.current.cheque?.id).toBe(cheque.id))
    expect(result.current.form.formState.isDirty).toBe(false)
    await act(async () =>
      result.current.handleImageUpload(new File(['x'], 'cheque.png')),
    )
    expect(result.current.form.getValues('image_url')).toBe('photo-url')
    expect(result.current.form.formState.isDirty).toBe(true)
  })
})
