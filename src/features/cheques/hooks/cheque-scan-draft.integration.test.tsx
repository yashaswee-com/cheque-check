import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateCheque } from './use-create-cheque'
import { useOcrExtraction } from './use-ocr-extraction'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  fetch: vi.fn(),
  getFile: vi.fn(),
  toast: vi.fn(),
  closeToast: vi.fn(),
  translate: (key: string) => key,
}))

vi.mock('@/features/drafts', async () => {
  const fields = await import('@/features/drafts/lib/draft-fields')
  const { useDraftController } =
    await import('@/features/drafts/hooks/use-draft-controller')
  return {
    ...fields,
    useDraftController,
    chequeDraftService: {},
    draftKeys: { all: () => ['drafts'] },
  }
})
vi.mock('@/features/drafts/hooks/use-drafts', () => ({
  useDraft: () => ({ isLoading: false, isFetchedAfterMount: false }),
  draftServices: {
    cheque: { create: mocks.createDraft, update: mocks.updateDraft },
  },
  draftKeys: {
    all: () => ['drafts'],
    detail: (entity: string, id: string) => ['draft', entity, id],
  },
}))
vi.mock('@/services/storage.service', () => ({
  storageService: { uploadChequeImage: mocks.upload },
}))
vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: {},
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: null }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ canUse: () => false }),
}))
vi.mock('@/features/parties/services/party.service', () => ({
  partyService: {},
}))
vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: {},
}))
vi.mock('@/lib/monitoring/telemetry', () => ({ monitoredFetch: mocks.fetch }))
vi.mock('@/lib/scan-store', () => ({ ScanStore: { getFile: mocks.getFile } }))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toast, close: mocks.closeToast },
}))
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function setup(initialBusinessId: string | undefined, aiScanEnabled = true) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    ({ businessId }: { businessId: string | undefined }) => {
      const create = useCreateCheque(businessId, 'Outward')
      const ocr = useOcrExtraction({
        businessId,
        imageUrlParam: null,
        parties: undefined,
        accounts: undefined,
        banks: undefined,
        watch: create.form.watch,
        setValue: create.form.setValue,
        handleImageUpload: create.handleImageUpload,
        isLoadingDraft: create.draft.isLoadingDraft,
        isUploading: create.isUploading,
        aiScanEnabled,
      })
      return { create, ocr }
    },
    { wrapper, initialProps: { businessId: initialBusinessId } },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.upload.mockResolvedValue(
    '/api/storage/private-cheque-images/u/image.jpg',
  )
  mocks.getFile.mockReturnValue(null)
  mocks.toast.mockReturnValue('toast')
  mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (body.action === 'read')
      return new Response(JSON.stringify({ data: null }))
    return new Response(
      JSON.stringify({
        data: {
          id: '10000000-0000-4000-8000-000000000001',
          draft_id: '10000000-0000-4000-8000-000000000002',
          business_id: '10000000-0000-4000-8000-000000000003',
          image_url: body.imageUrl,
          status: 'unusable',
          mode: 'Outward',
          credit_state: 'released',
          deadline_at: new Date().toISOString(),
          review_expires_at: null,
          reliability: null,
          error_code: null,
          details: {
            amount: 100,
            cheque_number: '123456',
            cheque_date: null,
            payee_name: null,
            account_number: null,
            account_name: null,
            ifsc_code: null,
            bank_name: null,
          },
        },
      }),
      { status: 200 },
    )
  })
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('scan and draft integration', () => {
  it('saves pending scan images as drafts without OCR when disabled', async () => {
    mocks.getFile.mockReturnValueOnce(
      new File(['image'], 'cheque.jpg', { type: 'image/jpeg' }),
    )
    mocks.createDraft.mockResolvedValue({ id: 'draft-1' })
    const { result } = setup('business-1', false)
    await waitFor(() =>
      expect(result.current.create.draft.draftId).toBe('draft-1'),
    )
    expect(result.current.create.form.getValues('image_url')).toBe(
      '/api/storage/private-cheque-images/u/image.jpg',
    )
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('waits for business and persisted image reference before sending a pending scan to OCR', async () => {
    const file = new File(['image'], 'cheque.jpg', { type: 'image/jpeg' })
    mocks.getFile.mockReturnValueOnce(file).mockReturnValue(null)
    let finishSave!: (value: { id: string }) => void
    mocks.createDraft.mockImplementation(
      () => new Promise((resolve) => (finishSave = resolve)),
    )
    const { result, rerender } = setup(undefined)
    expect(mocks.getFile).not.toHaveBeenCalled()
    rerender({ businessId: 'business-1' })
    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledOnce())
    expect(mocks.createDraft).toHaveBeenCalledWith(
      'business-1',
      expect.objectContaining({
        image_url: '/api/storage/private-cheque-images/u/image.jpg',
      }),
    )
    expect(mocks.fetch).not.toHaveBeenCalled()
    await act(async () => finishSave({ id: 'draft-1' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/ocr/cheque',
      expect.objectContaining({
        body: expect.stringContaining('"action":"start"'),
      }),
    )
    expect(result.current.create.form.getValues('amount')).toBe(0)
    expect(result.current.create.draft.draftId).toBe('draft-1')
  })

  it('does not request OCR when saving the image reference fails', async () => {
    mocks.getFile.mockReturnValueOnce(
      new File(['image'], 'cheque.jpg', { type: 'image/jpeg' }),
    )
    mocks.createDraft.mockRejectedValue(new Error('offline'))
    const { result } = setup('business-1')
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'error',
        description: 'saveFailed',
        type: 'error',
      }),
    )
    expect(
      mocks.fetch.mock.calls.some(
        ([, init]) => JSON.parse(init.body).action === 'start',
      ),
    ).toBe(false)
    expect(result.current.create.form.getValues('image_url')).toBeNull()
  })

  it('saves an existing draft image before returning it for a direct scan', async () => {
    mocks.createDraft.mockResolvedValue({ id: 'draft-1' })
    mocks.updateDraft.mockResolvedValue({ id: 'draft-1' })
    const { result } = setup('business-1')
    const file = new File(['image'], 'cheque.jpg', { type: 'image/jpeg' })

    await act(async () => {
      expect(await result.current.create.handleImageUpload(file)).toBe(
        '/api/storage/private-cheque-images/u/image.jpg',
      )
    })
    mocks.upload.mockResolvedValueOnce(
      '/api/storage/private-cheque-images/u/replacement.jpg',
    )
    let finishUpdate!: (value: { id: string }) => void
    mocks.updateDraft.mockImplementationOnce(
      () => new Promise((resolve) => (finishUpdate = resolve)),
    )
    let pending!: Promise<string | null>
    await act(async () => {
      pending = result.current.create.handleImageUpload(file)
      await Promise.resolve()
    })
    await waitFor(() => expect(mocks.updateDraft).toHaveBeenCalledOnce())
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        image_url: '/api/storage/private-cheque-images/u/replacement.jpg',
      }),
    )
    expect(
      mocks.fetch.mock.calls.some(
        ([, init]) => JSON.parse(init.body).action === 'start',
      ),
    ).toBe(false)
    await act(async () => {
      finishUpdate({ id: 'draft-1' })
      const url = await pending
      expect(url).toBe('/api/storage/private-cheque-images/u/replacement.jpg')
      if (url) await result.current.ocr.extractData(url)
    })
    expect(
      mocks.fetch.mock.calls.filter(
        ([, init]) => JSON.parse(init.body).action === 'start',
      ),
    ).toHaveLength(1)
    expect(mocks.createDraft).toHaveBeenCalledOnce()
  })
})
