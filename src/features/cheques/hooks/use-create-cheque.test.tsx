import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { queryKeys } from '@/lib/query-keys'
import { ConflictError, PlanLimitError } from '@/lib/errors'
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
  firstIncompleteChequeStep: vi.fn(),
  profile: { default_reminder_days: 5 } as {
    default_reminder_days: number
    time_zone?: string
  } | null,
  draft: {
    draftId: null as string | null,
    status: 'idle',
    hasUserChanges: false,
    isLoadingDraft: false,
    setUserValue: vi.fn(),
    saveNow: vi.fn(),
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
  firstIncompleteChequeStep: mocks.firstIncompleteChequeStep,
  toChequeDraftFields: vi.fn(),
  draftKeys: {
    all: () => ['drafts'],
    list: (entity: string, businessId: string) => [
      'drafts',
      entity,
      businessId,
    ],
  },
  useDraftController: mocks.useDraftController,
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
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
  mocks.useDraftController.mockImplementation(({ form }) => ({
    ...mocks.draft,
    setUserValue: (name: 'image_url', value: string) => {
      mocks.draft.setUserValue(name, value)
      form.setValue(name, value)
    },
  }))
  mocks.draft.draftId = null
  mocks.profile = { default_reminder_days: 5 }
  mocks.draft.beginPublish.mockResolvedValue(null)
  mocks.draft.saveNow.mockResolvedValue('draft-1')
  mocks.firstIncompleteChequeStep.mockReturnValue(2)
  mocks.create.mockResolvedValue(createdCheque)
  mocks.publish.mockResolvedValue(createdCheque)
  mocks.uploadImage.mockResolvedValue('/uploads/cheque.png')
  mocks.buildNotifyPartyAction.mockResolvedValue({ label: 'Notify' })
  mocks.premium.canUse.mockReturnValue(true)
  mocks.premium.requireAccess.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useCreateCheque', () => {
  it('defaults both dates to today in the profile time zone rather than UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'))
    mocks.profile = { default_reminder_days: 5, time_zone: 'Asia/Kolkata' }
    const { result } = setup()
    expect(result.current.form.getValues('deposit_date')).toBe('2026-11-01')
    expect(result.current.form.getValues('cheque_date')).toBe('2026-11-01')
  })
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
    expect(mocks.draft.setUserValue).toHaveBeenCalledWith(
      'image_url',
      '/uploads/cheque.png',
    )
    expect(mocks.draft.saveNow).toHaveBeenCalledOnce()

    mocks.uploadImage.mockRejectedValueOnce(new Error('Storage unavailable'))
    await act(async () => {
      url = await result.current.handleImageUpload(file)
    })
    expect(url).toBeNull()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'photoUploadFailed',
      type: 'error',
    })
    expect(result.current.isUploading).toBe(false)
  })

  it('waits for the image reference to be saved and restores it if saving fails', async () => {
    const { result } = setup()
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })
    let rejectSave!: (error: Error) => void
    mocks.draft.saveNow.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectSave = reject)),
    )
    let pending!: Promise<string | null>
    await act(async () => {
      pending = result.current.handleImageUpload(file)
      await Promise.resolve()
    })
    expect(result.current.isUploading).toBe(true)
    expect(result.current.isSaving).toBe(true)
    expect(result.current.form.getValues('image_url')).toBe(
      '/uploads/cheque.png',
    )
    await act(async () => {
      rejectSave(new Error('offline'))
      expect(await pending).toBeNull()
    })
    expect(result.current.form.getValues('image_url')).toBeNull()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'saveFailed',
      type: 'error',
    })
    expect(result.current.isUploading).toBe(false)
  })

  it('does not upload when no business is available or the draft is loading', async () => {
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })
    const missing = setup('Outward', {}, '')
    await act(async () =>
      expect(await missing.result.current.handleImageUpload(file)).toBeNull(),
    )
    expect(mocks.uploadImage).not.toHaveBeenCalled()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'saveFailed',
      type: 'error',
    })
    mocks.draft.isLoadingDraft = true
    const loading = setup()
    await act(async () =>
      expect(await loading.result.current.handleImageUpload(file)).toBeNull(),
    )
    expect(mocks.uploadImage).not.toHaveBeenCalled()
    mocks.draft.isLoadingDraft = false
  })

  it('does not return an image if the draft save is skipped', async () => {
    mocks.draft.saveNow.mockResolvedValueOnce(null)
    const { result } = setup()
    await act(async () => {
      expect(
        await result.current.handleImageUpload(
          new File(['scan'], 'scan.png', { type: 'image/png' }),
        ),
      ).toBeNull()
    })
    expect(result.current.form.getValues('image_url')).toBeNull()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'saveFailed',
      type: 'error',
    })
  })

  it('creates a cheque with its initial status and runs success side effects', async () => {
    const onCreated = vi.fn()
    const beforePublish = vi.fn()
    const { result, client } = setup('Outward', { onCreated, beforePublish })
    client.setQueryData(queryKeys.cheques.list('business-1'), [])
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
      queryKey: ['drafts'],
    })
    expect(onCreated).toHaveBeenCalledWith(createdCheque)
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerPush).toHaveBeenCalledWith('/cheques')
  })

  it('hydrates the wizard step and includes the profile reminder in autosaved fields', () => {
    const { result } = setup()
    const controllerOptions = mocks.useDraftController.mock.calls[0][0]

    act(() => controllerOptions.onHydrated({ id: 'draft-1' }))
    expect(result.current.step).toBe(2)
    expect(
      controllerOptions.toFields({ cheque_number: '123456' }),
    ).toMatchObject({ remind_before_days: 5 })
  })

  it('opens the Unlimited cheques upgrade instead of an error toast at the free cap', async () => {
    const { result } = setup('Outward', { draftId: 'draft-1' })
    mocks.draft.beginPublish.mockResolvedValue('draft-1')
    mocks.publish.mockRejectedValueOnce(
      new PlanLimitError('Free plan limit of 50 active cheques reached'),
    )
    setValidCheque(result)
    mocks.premium.requireAccess.mockClear()

    await act(async () => result.current.onSubmit())

    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(mocks.premium.requireAccess).toHaveBeenCalledWith(
      'unlimited-cheques',
    )
    expect(mocks.toastAdd).not.toHaveBeenCalled()
  })

  it('surfaces publish errors and rejects cheque creation without a business', async () => {
    const { result } = setup('Outward', { draftId: 'draft-1' })
    mocks.draft.beginPublish.mockResolvedValue('draft-1')
    mocks.publish.mockRejectedValueOnce(new ConflictError('Duplicate'))
    setValidCheque(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'duplicateChequeError',
      type: 'error',
    })

    mocks.create.mockClear()
    const missingBusiness = setup('Outward', {}, '')
    mocks.draft.beginPublish.mockResolvedValue(null)
    setValidCheque(missingBusiness.result)
    await act(async () => {
      await expect(missingBusiness.result.current.onSubmit()).rejects.toThrow(
        'Select a business before creating a cheque',
      )
    })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'Select a business before creating a cheque',
      type: 'error',
    })
  })

  it('uses generic upload and creation errors for non-Error failures', async () => {
    const { result } = setup()
    mocks.uploadImage.mockRejectedValueOnce('upload unavailable')
    await act(async () => {
      await result.current.handleImageUpload(
        new File(['scan'], 'scan.png', { type: 'image/png' }),
      )
    })
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'photoUploadFailed',
      type: 'error',
    })

    mocks.create.mockRejectedValueOnce('service unavailable')
    setValidCheque(result)
    await act(async () => {
      await expect(result.current.onSubmit()).rejects.toBe(
        'service unavailable',
      )
    })
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'error',
      type: 'error',
    })
  })

  it('uses nullable reminder defaults when profile data is absent and skips business celebration context', async () => {
    mocks.profile = null
    const { result } = setup(
      'Outward',
      { draftId: 'draft-without-profile' },
      '',
    )
    mocks.draft.beginPublish.mockResolvedValue('draft-without-profile')
    setValidCheque(result)
    const controllerOptions = mocks.useDraftController.mock.calls[0][0]
    expect(
      controllerOptions.toFields(result.current.form.getValues()),
    ).not.toHaveProperty('remind_before_days')

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'draft-without-profile',
      expect.objectContaining({ cheque_number: '123456' }),
      null,
    )
    expect(mocks.queueCelebration).toHaveBeenCalledWith({
      target: '/cheques',
      cheque: undefined,
    })
  })

  it('creates an ordinary cheque with null reminder defaults when profile data is absent', async () => {
    mocks.profile = null
    const { result } = setup()
    const controllerOptions = mocks.useDraftController.mock.calls[0][0]
    expect(
      controllerOptions.toFields(result.current.form.getValues()),
    ).toMatchObject({ remind_before_days: null })
    setValidCheque(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ remind_before_days: null }),
    )
  })
})
