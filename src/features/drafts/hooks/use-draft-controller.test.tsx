import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftController } from './use-draft-controller'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  toastAdd: vi.fn(),
  draftQuery: {
    data: undefined as { id: string; name: string } | undefined,
    isFetchedAfterMount: false,
    isError: false,
    isLoading: false,
  },
  autosave: {
    draftId: 'draft-1' as string | null,
    status: 'saved' as string,
    hasUserChanges: true,
    setUserValue: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    forget: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
  },
  guard: {
    isLeavePending: false,
    confirmLeave: vi.fn(),
    cancelLeave: vi.fn(),
    bypass: vi.fn((navigate: () => void) => navigate()),
    goBack: vi.fn(),
  },
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
vi.mock('./use-drafts', () => ({
  useDraft: () => mocks.draftQuery,
}))
vi.mock('./use-draft-autosave', () => ({
  useDraftAutosave: () => mocks.autosave,
}))
vi.mock('./use-leave-guard', () => ({
  useLeaveGuard: () => mocks.guard,
}))

type Values = { name: string }

function setup(
  initialDraftId: string | null = 'draft-1',
  notifyHydration = true,
) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const toFormValues = vi.fn((draft: { name: string }) => ({
    name: draft.name,
  }))
  const onHydrated = vi.fn()
  const hook = renderHook(
    () => {
      const form = useForm<Values>({ defaultValues: { name: '' } })
      const controller = useDraftController<
        Values,
        { id: string; name: string }
      >({
        entity: 'party',
        businessId: 'business-1',
        form,
        initialDraftId,
        toFields: (values) => values,
        toFormValues,
        onHydrated: notifyHydration ? onHydrated : undefined,
        draftsHref: '/drafts?type=party',
      })
      return { form, controller }
    },
    { wrapper },
  )
  return { ...hook, client, toFormValues, onHydrated }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.draftQuery.data = undefined
  mocks.draftQuery.isFetchedAfterMount = false
  mocks.draftQuery.isError = false
  mocks.draftQuery.isLoading = false
  mocks.autosave.draftId = 'draft-1'
  mocks.autosave.status = 'saved'
  mocks.autosave.hasUserChanges = true
  mocks.guard.isLeavePending = false
  mocks.guard.bypass.mockImplementation((navigate) => navigate())
  mocks.autosave.save.mockResolvedValue('draft-1')
  mocks.autosave.discard.mockResolvedValue(undefined)
  mocks.autosave.stop.mockResolvedValue('draft-1')
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('useDraftController', () => {
  it('marks publishing complete and does not confirm navigation after failed leave saves', async () => {
    const { result } = setup()
    act(() => result.current.controller.finishPublish())
    mocks.autosave.save.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.controller.leaveDialogProps.onSave())
    expect(mocks.guard.confirmLeave).not.toHaveBeenCalled()
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'error',
      description: 'saveFailed',
      type: 'error',
    })
    mocks.autosave.save.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.controller.saveDraft())
    expect(mocks.toastAdd).toHaveBeenCalledTimes(2)
  })
  it('hydrates only after a fresh fetch and does not reset the same draft twice', async () => {
    const { result, rerender, toFormValues, onHydrated } = setup()
    mocks.draftQuery.data = { id: 'draft-1', name: 'Restored' }
    mocks.draftQuery.isLoading = true
    rerender()
    expect(result.current.controller.isLoadingDraft).toBe(true)
    expect(result.current.form.getValues('name')).toBe('')

    mocks.draftQuery.isLoading = false
    mocks.draftQuery.isFetchedAfterMount = true
    rerender()
    await waitFor(() =>
      expect(result.current.form.getValues('name')).toBe('Restored'),
    )
    expect(toFormValues).toHaveBeenCalledOnce()
    expect(onHydrated).toHaveBeenCalledWith({
      id: 'draft-1',
      name: 'Restored',
    })

    mocks.draftQuery.data = { ...mocks.draftQuery.data }
    rerender()
    expect(toFormValues).toHaveBeenCalledOnce()
  })

  it('hydrates a draft when no optional hydration callback is supplied', async () => {
    mocks.draftQuery.data = { id: 'draft-1', name: 'Restored' }
    mocks.draftQuery.isFetchedAfterMount = true
    const { result, onHydrated } = setup('draft-1', false)
    await waitFor(() =>
      expect(result.current.form.getValues('name')).toBe('Restored'),
    )
    expect(onHydrated).not.toHaveBeenCalled()
  })

  it('drops an unavailable draft id from the URL and forgets autosave state', async () => {
    window.history.replaceState(
      null,
      '',
      '/parties/new?draftId=draft-1&keep=yes',
    )
    const { result, rerender } = setup()
    mocks.draftQuery.isError = true
    rerender()

    await waitFor(() => expect(mocks.autosave.forget).toHaveBeenCalledOnce())
    expect(new URL(window.location.href).searchParams.has('draftId')).toBe(
      false,
    )
    expect(new URL(window.location.href).searchParams.get('keep')).toBe('yes')
    expect(result.current.controller.isLoadingDraft).toBe(false)
  })

  it('saves and exits only after success, and shows a localized error on failure', async () => {
    const { result } = setup(null)
    await act(async () => result.current.controller.saveDraftAndExit())
    expect(mocks.autosave.save).toHaveBeenCalledOnce()
    expect(mocks.guard.bypass).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledWith('/drafts?type=party')
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      title: 'saved',
      type: 'success',
    })

    mocks.autosave.save.mockRejectedValueOnce(new Error('offline'))
    await act(async () => result.current.controller.saveDraftAndExit())
    expect(mocks.routerPush).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith({
      title: 'error',
      description: 'saveFailed',
      type: 'error',
    })
  })

  it('supports in-place save and builds navigation only after saving', async () => {
    const { result } = setup(null)
    const buildHref = vi.fn((id: string | null) => `/cheques/new?draftId=${id}`)

    await act(async () => result.current.controller.saveDraft())
    await act(async () =>
      result.current.controller.navigateAfterSave(buildHref),
    )

    expect(buildHref).toHaveBeenCalledWith('draft-1')
    expect(mocks.routerPush).toHaveBeenCalledWith(
      '/cheques/new?draftId=draft-1',
    )

    mocks.autosave.save.mockRejectedValueOnce(new Error('storage failed'))
    await act(async () =>
      result.current.controller.navigateAfterSave(buildHref),
    )
    expect(buildHref).toHaveBeenCalledOnce()
  })

  it('supports leave-dialog save, discard, cancel, and publish recovery', async () => {
    const { result } = setup()

    await act(async () => result.current.controller.leaveDialogProps.onSave())
    expect(mocks.guard.confirmLeave).toHaveBeenCalledOnce()

    await act(async () =>
      result.current.controller.leaveDialogProps.onDiscard(),
    )
    expect(mocks.autosave.discard).toHaveBeenCalledOnce()
    expect(mocks.guard.confirmLeave).toHaveBeenCalledTimes(2)

    act(() => result.current.controller.leaveDialogProps.onCancel())
    expect(mocks.guard.cancelLeave).toHaveBeenCalledOnce()

    await act(async () => {
      await result.current.controller.beginPublish()
      result.current.controller.failPublish()
    })
    expect(mocks.autosave.stop).toHaveBeenCalledOnce()
    expect(mocks.autosave.resume).toHaveBeenCalledOnce()
  })
})
