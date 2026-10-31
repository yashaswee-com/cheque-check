import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Party } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { useCreateParty } from './use-create-party'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  publish: vi.fn(),
  updateChequeDraft: vi.fn(),
  routerReplace: vi.fn(),
  toastAdd: vi.fn(),
  useDraftController: vi.fn(),
  firstIncompletePartyStep: vi.fn(),
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

vi.mock('@/features/parties/services/party.service', () => ({
  partyService: { create: mocks.create },
}))
vi.mock('@/features/drafts', () => ({
  partyDraftService: { publish: mocks.publish },
  chequeDraftService: { update: mocks.updateChequeDraft },
  partyDraftToFormValues: vi.fn(),
  firstIncompletePartyStep: mocks.firstIncompletePartyStep,
  toPartyDraftFields: vi.fn(),
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
  useRouter: () => ({ replace: mocks.routerReplace }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}))

const party = {
  id: 'party-1',
  name: 'Acme Traders',
  contact: '+919876543210',
  email: null,
  address: null,
  notes: null,
  avatar_url: null,
} as unknown as Party

function setup(options: Parameters<typeof useCreateParty>[1] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useCreateParty('business-1', options), {
    wrapper,
  })
  return { ...hook, client }
}

function setValidParty(result: ReturnType<typeof setup>['result']) {
  act(() => {
    result.current.form.setValue('name', 'Acme Traders')
    result.current.form.setValue('contact', '+919876543210')
    result.current.form.setValue('email', '')
    result.current.form.setValue('address', '')
    result.current.form.setValue('notes', '')
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.useDraftController.mockReturnValue(mocks.draft)
  mocks.draft.draftId = null
  mocks.draft.beginPublish.mockResolvedValue(null)
  mocks.firstIncompletePartyStep.mockReturnValue(2)
  mocks.create.mockResolvedValue(party)
  mocks.publish.mockResolvedValue(party)
  mocks.updateChequeDraft.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('useCreateParty', () => {
  it('validates the name and contact steps and clamps navigation', async () => {
    const { result } = setup()

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(1)
    act(() => result.current.form.setValue('name', 'Acme Traders'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)

    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)
    act(() => result.current.form.setValue('contact', '+919876543210'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(2)
  })

  it('creates a party with empty optional fields normalized and invokes onCreated', async () => {
    const onCreated = vi.fn()
    const { result, client } = setup({ onCreated })
    client.setQueryData(queryKeys.parties.list('business-1'), [])
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'business-1',
        name: 'Acme Traders',
        contact: '+919876543210',
        email: null,
        address: null,
        notes: null,
        avatar_url: null,
      }),
    )
    expect(onCreated).toHaveBeenCalledWith(party)
    expect(mocks.draft.finishPublish).toHaveBeenCalledOnce()
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.draft.goBack).toHaveBeenCalledOnce()
  })

  it('publishes an existing draft, assigns the party to a cheque, and redirects', async () => {
    const returnTo = '/cheques/new?draftId=cheque-draft-2'
    const onCreated = vi.fn()
    const { result, client } = setup({ returnTo, onCreated })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    mocks.draft.beginPublish.mockResolvedValue('party-draft-1')
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'party-draft-1',
      expect.objectContaining({ name: 'Acme Traders' }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.updateChequeDraft).toHaveBeenCalledWith('cheque-draft-2', {
      party_id: party.id,
    })
    expect(onCreated).toHaveBeenCalledWith(party)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.parties.list('business-1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['drafts', 'party', 'business-1'],
    })
    expect(result.current.isSuccess).toBe(true)

    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith(returnTo)
  })

  it('recovers the draft controller and displays errors when draft publication fails', async () => {
    const { result } = setup({ returnTo: '/cheques/new' })
    mocks.draft.beginPublish.mockResolvedValue('party-draft-1')
    mocks.publish.mockRejectedValueOnce(new Error('Party could not be saved'))
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'Party could not be saved',
      type: 'error',
    })
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.isSaving).toBe(false)
  })

  it('hydrates the wizard step and creates a new party before returning to a cheque draft', async () => {
    const returnTo = '/cheques/new?draftId=cheque-draft-2'
    const onCreated = vi.fn()
    const { result } = setup({ returnTo, onCreated })
    const controllerOptions = mocks.useDraftController.mock.calls[0][0]
    act(() => controllerOptions.onHydrated({ id: 'party-draft-1' }))
    expect(result.current.step).toBe(2)
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith(party)
    expect(mocks.updateChequeDraft).toHaveBeenCalledWith('cheque-draft-2', {
      party_id: party.id,
    })
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith(returnTo)
  })

  it('publishes a party draft without a return destination and marks the workflow complete', async () => {
    const { result } = setup()
    mocks.draft.beginPublish.mockResolvedValue('party-draft-1')
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.publish).toHaveBeenCalledWith(
      'party-draft-1',
      expect.objectContaining({ name: 'Acme Traders' }),
    )
    expect(mocks.draft.finishPublish).toHaveBeenCalledOnce()
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isSaving).toBe(false)
  })

  it('uses the generic error message for non-Error publication failures', async () => {
    const { result } = setup({ returnTo: '/parties/new' })
    mocks.draft.beginPublish.mockResolvedValue('party-draft-3')
    mocks.publish.mockRejectedValueOnce('service unavailable')
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'error',
      type: 'error',
    })
    expect(mocks.draft.failPublish).toHaveBeenCalledOnce()
    expect(result.current.isSaving).toBe(false)
  })

  it('does not link a cheque draft for a non-draft return destination', async () => {
    const { result } = setup({ returnTo: '/parties/new' })
    mocks.draft.beginPublish.mockResolvedValue('party-draft-4')
    setValidParty(result)

    await act(async () => result.current.onSubmit())

    expect(mocks.updateChequeDraft).not.toHaveBeenCalled()
    act(() => result.current.continueAfterSuccess())
    expect(mocks.routerReplace).toHaveBeenCalledWith('/parties/new')
  })
})
