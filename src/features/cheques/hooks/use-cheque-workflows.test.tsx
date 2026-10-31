import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cheque } from '@/domain/cheque.entity'
import { queryKeys } from '@/lib/query-keys'
import { useEditCheque } from './use-edit-cheque'
import { useChequeActions } from './use-cheque-actions'
import { useChequeDetail } from './use-cheque-detail'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  updateStatus: vi.fn(),
  upload: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('../services/cheque.service', () => ({ chequeService: mocks }))
vi.mock('@/services/storage.service', () => ({
  storageService: { uploadChequeImage: mocks.upload },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'b1' } }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'profile1' } }),
}))
vi.mock('@/features/monetization/hooks/use-premium-access', () => ({
  usePremiumAccess: () => ({ canUse: () => true }),
}))
vi.mock('../lib/notify-party', () => ({ buildNotifyPartyAction: mocks.notify }))

const original = Cheque.fromRow({
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '123456',
  amount: 100,
  type: 'Outward',
  status: 'Issued',
  cheque_date: '2026-10-01',
  deposit_date: '2026-10-02',
  notes: null,
  image_url: null,
  remind_before_days: null,
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
})
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.cheques.list('b1'), [original])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(original)
  mocks.update.mockResolvedValue(original)
  mocks.delete.mockResolvedValue(undefined)
  mocks.updateStatus.mockResolvedValue(
    Cheque.fromRow({ ...original.toJSON(), status: 'Cleared' }),
  )
  mocks.upload.mockResolvedValue('/uploaded.png')
  mocks.notify.mockResolvedValue({ label: 'Notify' })
})
afterEach(cleanup)

describe('cheque edit and action workflows', () => {
  it('hydrates the editor, uploads an image, and updates class-based cached cheques', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useEditCheque('c1'), { wrapper })
    await waitFor(() =>
      expect(result.current.form.getValues('amount')).toBe(100),
    )
    expect(result.current.form.getValues('notes')).toBe('')
    const file = new File(['image'], 'scan.png')
    await act(async () => result.current.handleImageUpload(file))
    expect(mocks.upload).toHaveBeenCalledWith(file)
    expect(result.current.form.getValues('image_url')).toBe('/uploaded.png')
    act(() => result.current.form.setValue('amount', 250))
    await act(async () => result.current.onSubmit())
    expect(mocks.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ amount: 250, image_url: '/uploaded.png' }),
    )
    const cached = client.getQueryData<Cheque[]>(
      queryKeys.cheques.list('b1'),
    )?.[0]
    expect(cached).toBeInstanceOf(Cheque)
    expect(cached?.amount).toBe(250)
    expect(mocks.back).toHaveBeenCalledOnce()
  })
  it('blocks submission during upload and displays upload/update failures without navigation', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useEditCheque('c1'), { wrapper })
    await waitFor(() => expect(result.current.cheque?.id).toBe('c1'))
    let resolve!: (url: string) => void
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleImageUpload(
        new File(['image'], 'scan.png'),
      )
    })
    expect(result.current.isUploading).toBe(true)
    await act(async () => result.current.onSubmit())
    expect(mocks.update).not.toHaveBeenCalled()
    await act(async () => {
      resolve('/image.png')
      await pending
    })
    mocks.upload.mockRejectedValueOnce(new Error('upload failed'))
    await act(async () =>
      result.current.handleImageUpload(new File(['image'], 'scan.png')),
    )
    expect(mocks.toast).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'upload failed',
      type: 'error',
    })
    mocks.update.mockRejectedValueOnce(new Error('update failed'))
    await act(async () => result.current.onSubmit())
    expect(mocks.toast).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'update failed',
      type: 'error',
    })
    expect(mocks.back).not.toHaveBeenCalled()
    expect(result.current.isUploading).toBe(false)
  })
  it('deletes from the editor and navigates to the cheque list', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useEditCheque('c1'), { wrapper })
    await waitFor(() => expect(result.current.cheque?.id).toBe('c1'))
    act(() => result.current.onDelete())
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('c1'))
    expect(client.getQueryData(queryKeys.cheques.list('b1'))).toEqual([])
    expect(mocks.push).toHaveBeenCalledWith('/cheques')
  })
  it('updates status through list actions and includes the notification action in success feedback', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useChequeActions(), { wrapper })
    act(() => result.current.updateStatus('c1', 'Cleared'))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled())
    expect(mocks.updateStatus).toHaveBeenCalledWith('c1', 'Cleared')
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.any(Cheque),
      { id: 'profile1' },
      'notifyParty',
      true,
      'states.free',
    )
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'success',
      description: 'statusUpdated',
      type: 'success',
      actionProps: { label: 'Notify' },
    })
    act(() => result.current.deleteCheque('c1'))
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('c1'))
  })
  it('fetches a detail and shares status mutation feedback while exposing load errors', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useChequeDetail('c1'), { wrapper })
    await waitFor(() => expect(result.current.cheque?.id).toBe('c1'))
    act(() => result.current.updateStatus('Cleared'))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled())
    expect(mocks.updateStatus).toHaveBeenCalledWith('c1', 'Cleared')
    const other = setup()
    mocks.getById.mockRejectedValueOnce(new Error('cheque unavailable'))
    const failed = renderHook(() => useChequeDetail('missing'), {
      wrapper: other.wrapper,
    })
    await waitFor(() =>
      expect(failed.result.current.error?.message).toBe('cheque unavailable'),
    )
  })
})
