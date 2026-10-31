import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { useCreateAccount } from './use-create-account'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  publish: vi.fn(),
  updateChequeDraft: vi.fn(),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  toastAdd: vi.fn(),
  useDraftController: vi.fn(),
  firstIncompleteAccountStep: vi.fn(),
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
    goBack: vi.fn(),
  },
}))

vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: { create: mocks.create },
}))
vi.mock('@/features/drafts', () => ({
  accountDraftService: { publish: mocks.publish },
  chequeDraftService: { update: mocks.updateChequeDraft },
  accountDraftToFormValues: vi.fn(),
  firstIncompleteAccountStep: mocks.firstIncompleteAccountStep,
  toAccountDraftFields: vi.fn(),
  draftKeys: {
    list: (entity: string, businessId: string) => [
      'drafts',
      entity,
      businessId,
    ],
  },
  useDraftController: mocks.useDraftController,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace, push: mocks.routerPush }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}))

const account = {
  id: 'account-1',
  bank_id: 'bank-1',
  account_name: 'Primary',
  account_number: '123456789',
  ifsc_code: null,
  opening_balance: 25,
  is_default: false,
} as unknown as Account

function setup(options: Parameters<typeof useCreateAccount>[1] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useCreateAccount('business-1', options), {
    wrapper,
  })
  return { ...hook, client }
}

function setValidAccount(result: ReturnType<typeof setup>['result']) {
  act(() => {
    result.current.form.setValue('bank_id', 'bank-1')
    result.current.form.setValue('account_name', 'Primary')
    result.current.form.setValue('account_number', '123456789')
    result.current.form.setValue('ifsc_code', '')
    result.current.form.setValue('opening_balance', 25)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.useDraftController.mockReturnValue(mocks.draft)
  mocks.draft.draftId = null
  mocks.draft.beginPublish.mockResolvedValue(null)
  mocks.firstIncompleteAccountStep.mockReturnValue(2)
  mocks.create.mockResolvedValue(account)
  mocks.publish.mockResolvedValue(account)
  mocks.updateChequeDraft.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('useCreateAccount', () => {
  it('validates each wizard step and prevents moving outside the first/last step', async () => {
    const { result } = setup()

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(1)

    act(() => result.current.form.setValue('bank_id', 'bank-1'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)

    act(() => {
      result.current.form.setValue('account_name', 'Primary')
      result.current.form.setValue('account_number', '123456789')
    })
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(2)
  })

  it('creates an account with normalized optional fields and reports completion', async () => {
    const onCreated = vi.fn()
    const { result, client } = setup({ onCreated })
    client.setQueryData(queryKeys.accounts.list('business-1'), [])
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bank_id: 'bank-1',
        business_id: 'business-1',
        ifsc_code: null,
        opening_balance: 25,
      }),
    )
    expect(onCreated).toHaveBeenCalledWith(account)
    expect(mocks.draft.finishPublish).toHaveBeenCalledOnce()
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isSaving).toBe(false)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.draft.goBack).toHaveBeenCalledOnce()
  })

  it('publishes a resumed draft, links it to the cheque draft, and returns to the caller', async () => {
    const onCreated = vi.fn()
    const returnTo = '/cheques/new?draftId=cheque-draft-1'
    const { result, client } = setup({ returnTo, onCreated })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    mocks.draft.beginPublish.mockResolvedValue('account-draft-1')
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'account-draft-1',
      expect.objectContaining({ account_name: 'Primary' }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.updateChequeDraft).toHaveBeenCalledWith('cheque-draft-1', {
      account_id: account.id,
    })
    expect(onCreated).toHaveBeenCalledWith(account)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.accounts.list('business-1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['drafts', 'account', 'business-1'],
    })
    expect(result.current.isSuccess).toBe(true)

    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith(returnTo)
  })

  it('resumes draft autosaving and surfaces publication errors', async () => {
    const { result } = setup({
      returnTo: '/cheques/new?draftId=cheque-draft-1',
    })
    mocks.draft.beginPublish.mockResolvedValue('account-draft-1')
    mocks.publish.mockRejectedValueOnce(new Error('Account could not be saved'))
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'Account could not be saved',
      type: 'error',
    })
    expect(result.current.isSuccess).toBe(false)
    await waitFor(() => expect(result.current.isSaving).toBe(false))
  })

  it('hydrates the wizard step and creates a new account before returning to a cheque draft', async () => {
    const returnTo = '/cheques/new?draftId=cheque-draft-1'
    const onCreated = vi.fn()
    const { result } = setup({ returnTo, onCreated })
    const controllerOptions = mocks.useDraftController.mock.calls[0][0]
    act(() => controllerOptions.onHydrated({ id: 'account-draft-1' }))
    expect(result.current.step).toBe(2)
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith(account)
    expect(mocks.updateChequeDraft).toHaveBeenCalledWith('cheque-draft-1', {
      account_id: account.id,
    })
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith(returnTo)
  })

  it('publishes a draft without a return destination and marks the workflow complete', async () => {
    const { result } = setup()
    mocks.draft.beginPublish.mockResolvedValue('account-draft-1')
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'account-draft-1',
      expect.objectContaining({ account_name: 'Primary' }),
    )
    expect(mocks.draft.finishPublish).toHaveBeenCalledOnce()
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isSaving).toBe(false)
  })

  it('uses the generic error message and preserves non-draft return destinations', async () => {
    const { result } = setup({ returnTo: '/accounts/new' })
    mocks.draft.beginPublish.mockResolvedValue('account-draft-2')
    mocks.publish.mockRejectedValueOnce('service unavailable')
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'error',
      type: 'error',
    })
    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(result.current.isSaving).toBe(false)
  })

  it('returns to a non-draft destination without linking a cheque draft', async () => {
    const { result } = setup({ returnTo: '/accounts/new' })
    mocks.draft.beginPublish.mockResolvedValue('account-draft-3')
    setValidAccount(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.updateChequeDraft).not.toHaveBeenCalled()
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith('/accounts/new')
  })
})
