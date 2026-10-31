import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { queryKeys } from '@/lib/query-keys'
import { ConflictError } from '@/lib/errors'
import { useCreateCheque } from './use-create-cheque'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  publish: vi.fn(),
  uploadImage: vi.fn(),
  buildNotifyPartyAction: vi.fn(),
  queueCelebration: vi.fn(),
  routerPush: vi.fn(),
  toastAdd: vi.fn(),
  useDraftController: vi.fn(),
  draft: {
    draftId: null as string | null,
    status: 'idle',
    hasUserChanges: false,
    setUserValue: vi.fn(),
    saveDraft: vi.fn(),
    saveDraftAndExit: vi.fn(),
    navigateAfterSave: vi.fn(),
    leaveDialogProps: {},
    beginPublish: vi.fn(),
    finishPublish: vi.fn(),
    failPublish: vi.fn(),
  },
  premium: {
    canUse: vi.fn(),
    requireAccess: vi.fn(),
    accessRequiredMessage: 'Upgrade required',
  },
}))

vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: { create: mocks.create },
}))
vi.mock('@/services/storage.service', () => ({
  storageService: { uploadChequeImage: mocks.uploadImage },
}))
vi.mock('@/features/drafts', () => ({
  chequeDraftService: { publish: mocks.publish },
  chequeDraftToFormValues: vi.fn(),
  firstIncompleteChequeStep: vi.fn(),
  toChequeDraftFields: vi.fn(),
  draftKeys: {
    list: (entity: string, businessId: string) => [
      'drafts',
      entity,
      businessId,
    ],
  },
  useDraftController: mocks.useDraftController,
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { default_reminder_days: 5 } }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => mocks.premium,
}))
vi.mock('@/features/cheques/lib/notify-party', () => ({
  buildNotifyPartyAction: mocks.buildNotifyPartyAction,
}))
vi.mock('@/lib/celebrate', () => ({
  queueCelebration: mocks.queueCelebration,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}))

const createdCheque = ChequeEntity.fromRow({
  id: 'cheque-1',
  business_id: 'business-1',
  party_id: 'party-1',
  account_id: 'account-1',
  cheque_number: '123456',
  amount: 125,
  cheque_date: '2026-10-30',
  deposit_date: '2026-11-01',
  remind_before_days: 5,
  status: 'Issued',
  type: 'Outward',
  notes: null,
  image_url: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
})

function setup(
  initialType: string | null = 'Outward',
  options: Parameters<typeof useCreateCheque>[2] = {},
  businessId: string | undefined = 'business-1',
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({ type }: { type: string | null }) =>
      useCreateCheque(businessId, type, options),
    { wrapper, initialProps: { type: initialType } },
  )
  return { ...hook, client }
}

function setValidCheque(result: ReturnType<typeof setup>['result']) {
  act(() => {
    result.current.form.setValue('amount', 125)
    result.current.form.setValue('cheque_number', '123456')
    result.current.form.setValue('cheque_date', '2026-10-30')
    result.current.form.setValue('deposit_date', '2026-11-01')
    result.current.form.setValue('party_id', 'party-1')
    result.current.form.setValue('account_id', 'account-1')
    result.current.form.setValue('notes', '')
    result.current.form.setValue('image_url', null)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.useDraftController.mockReturnValue(mocks.draft)
  mocks.draft.draftId = null
  mocks.draft.beginPublish.mockResolvedValue(null)
  mocks.create.mockResolvedValue(createdCheque)
  mocks.publish.mockResolvedValue(createdCheque)
  mocks.uploadImage.mockResolvedValue('/uploads/cheque.png')
  mocks.buildNotifyPartyAction.mockResolvedValue({ label: 'Notify' })
  mocks.premium.canUse.mockReturnValue(true)
  mocks.premium.requireAccess.mockReturnValue(true)
})

afterEach(cleanup)

describe('useCreateCheque', () => {
  it('updates the selected cheque type and validates the three-step wizard', async () => {
    const { result, rerender } = setup('unexpected')
    expect(result.current.form.getValues('type')).toBe('Outward')

    rerender({ type: 'Inward' })
    expect(result.current.form.getValues('type')).toBe('Inward')

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(1)
    act(() => {
      result.current.form.setValue('amount', 125)
      result.current.form.setValue('cheque_number', '123456')
    })
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)

    act(() => {
      result.current.form.setValue('party_id', 'party-1')
      result.current.form.setValue('account_id', 'account-1')
    })
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(2)
  })

  it('uploads cheque images, stores the URL, and reports failure without leaving upload state active', async () => {
    const { result } = setup()
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })

    let url: string | null = null
    await act(async () => {
      url = await result.current.handleImageUpload(file)
    })
    expect(url).toBe('/uploads/cheque.png')
    expect(result.current.form.getValues('image_url')).toBe(
      '/uploads/cheque.png',
    )
    expect(result.current.isUploading).toBe(false)

    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    mocks.uploadImage.mockRejectedValueOnce(new Error('Storage unavailable'))
    await act(async () => {
      url = await result.current.handleImageUpload(file)
    })
    expect(url).toBeNull()
    expect(alert).toHaveBeenCalledWith('Upload failed: Storage unavailable')
    expect(result.current.isUploading).toBe(false)
    alert.mockRestore()
  })

  it('creates a cheque with its initial status and runs success side effects', async () => {
    const onCreated = vi.fn()
    const beforePublish = vi.fn()
    const { result, client } = setup('Outward', { onCreated, beforePublish })
    client.setQueryData(queryKeys.parties.list('business-1'), [
      { id: 'party-1', name: 'Acme' },
    ])
    setValidCheque(result)

    await act(async () => result.current.onSubmit())

    expect(beforePublish).toHaveBeenCalledWith(null)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'business-1',
        type: 'Outward',
        status: 'Issued',
        remind_before_days: 5,
        notes: null,
        image_url: null,
      }),
    )
    expect(onCreated).toHaveBeenCalledWith(createdCheque)
    expect(mocks.buildNotifyPartyAction).toHaveBeenCalledWith(
      createdCheque,
      { default_reminder_days: 5 },
      'notifyParty',
      true,
      'Upgrade required',
    )
    expect(mocks.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'success',
        description: 'chequeCreated',
        type: 'success',
      }),
    )
    expect(mocks.queueCelebration).toHaveBeenCalledWith({
      target: '/cheques',
      cheque: { id: 'cheque-1', businessId: 'business-1' },
    })
    expect(result.current.isSuccess).toBe(true)
  })

  it('blocks inward creation without premium access and restores drafts if pre-publish fails', async () => {
    const { result, rerender } = setup('Inward', {
      beforePublish: vi.fn().mockRejectedValue(new ConflictError('Duplicate')),
    })
    setValidCheque(result)
    mocks.premium.requireAccess.mockReturnValue(false)

    await act(async () => result.current.onSubmit())
    expect(mocks.draft.beginPublish).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()

    mocks.premium.requireAccess.mockReturnValue(true)
    await act(async () => result.current.onSubmit())
    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'duplicateChequeError',
      type: 'error',
    })
    expect(result.current.isSuccess).toBe(false)
    rerender({ type: 'Inward' })
  })

  it('publishes an existing cheque draft and invalidates cheque and draft lists', async () => {
    const onCreated = vi.fn()
    const { result, client } = setup('Outward', {
      draftId: 'draft-1',
      onCreated,
    })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    mocks.draft.beginPublish.mockResolvedValue('draft-1')
    setValidCheque(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ cheque_number: '123456' }),
      5,
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.draft.finishPublish).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.cheques.list('business-1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['drafts', 'cheque', 'business-1'],
    })
    expect(onCreated).toHaveBeenCalledWith(createdCheque)
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerPush).toHaveBeenCalledWith('/cheques')
  })
})
