import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { toPartyDraftFields } from '../lib/draft-fields'
import { useDraftAutosave } from './use-draft-autosave'

const service = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./use-drafts', () => ({
  draftServices: { party: service },
  draftKeys: {
    all: () => ['drafts'],
    list: (entity: string, businessId: string) => [
      'drafts',
      entity,
      businessId,
    ],
    detail: (entity: string, id: string) => ['draft', entity, id],
  },
}))

type Values = { name: string; contact: string; color: string }

function renderAutosave(initialDraftId: string | null = null) {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => {
      const form = useForm<Values>({
        defaultValues: { name: '', contact: '', color: '#34C759' },
      })
      const autosave = useDraftAutosave({
        entity: 'party',
        businessId: 'b1',
        form,
        toFields: toPartyDraftFields,
        initialDraftId,
      })
      return { form, autosave }
    },
    { wrapper },
  )
}

async function typeName(
  result: ReturnType<typeof renderAutosave>['result'],
  value: string,
) {
  await act(async () => {
    await result.current.form.register('name').onChange({
      target: { name: 'name', value },
      type: 'change',
    })
  })
}

describe('useDraftAutosave', () => {
  it('updates an existing draft without rewriting its URL or identity', async () => {
    window.history.replaceState(null, '', '/parties/create?draftId=d1&keep=yes')
    const { result } = renderAutosave('d1')
    let saved: string | null = null
    await act(async () => {
      saved = await result.current.autosave.save()
    })
    expect(saved).toBe('d1')
    expect(result.current.autosave.status).toBe('saved')
    expect(result.current.autosave.draftId).toBe('d1')
    expect(service.update).toHaveBeenCalledWith('d1', expect.any(Object))
    expect(service.create).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?draftId=d1&keep=yes')
  })
  it('resumes after publishing is interrupted and forgets deleted draft identities', async () => {
    const { result } = renderAutosave('d1')
    await act(() => result.current.autosave.stop())
    act(() => {
      result.current.autosave.resume()
      result.current.autosave.forget()
    })
    expect(result.current.autosave.draftId).toBeNull()
    await typeName(result, 'Fresh')
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(service.create).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ name: 'Fresh' }),
    )
    expect(service.update).not.toHaveBeenCalled()
  })

  it('catches debounced save failures, cancels pending timers on unmount and unsubscribes the form', async () => {
    const log = vi
      .spyOn(logger, 'error')
      .mockImplementationOnce(() => 'test-reference')
    const error = new Error('offline')
    const { result, unmount } = renderAutosave()
    service.create.mockRejectedValueOnce(error)
    await typeName(result, 'Unsaved')
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(result.current.autosave.status).toBe('error')
    await typeName(result, 'Pending')
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(service.create).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledExactlyOnceWith('Draft autosave failed', error)
    await typeName(result, 'After unmount')
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(service.create).toHaveBeenCalledOnce()
  })
  beforeEach(() => {
    vi.useFakeTimers()
    service.create.mockResolvedValue({ id: 'd1' })
    service.update.mockResolvedValue({ id: 'd1' })
    service.delete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('ignores programmatic values such as OCR prefill', async () => {
    const { result } = renderAutosave()

    act(() => result.current.form.setValue('name', 'Scanned Name'))
    await act(() => vi.advanceTimersByTimeAsync(2000))

    expect(service.create).not.toHaveBeenCalled()
    expect(result.current.autosave.hasUserChanges).toBe(false)
  })

  it('creates the draft once after typing stops, then updates it', async () => {
    const { result } = renderAutosave()

    await typeName(result, 'A')
    await typeName(result, 'Ac')
    await act(() => vi.advanceTimersByTimeAsync(1500))

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ name: 'Ac' }),
    )
    expect(result.current.autosave.draftId).toBe('d1')
    expect(window.location.search).toContain('draftId=d1')

    await typeName(result, 'Acme')
    await act(() => vi.advanceTimersByTimeAsync(1500))

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.update).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ name: 'Acme' }),
    )
  })

  it('treats setUserValue as a user change', async () => {
    const { result } = renderAutosave()

    act(() => result.current.autosave.setUserValue('color', '#FF3B30'))
    await act(() => vi.advanceTimersByTimeAsync(1500))

    expect(service.create).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ color: '#FF3B30' }),
    )
  })

  it('serializes overlapping saves so only one draft row is created', async () => {
    let resolveCreate: (value: { id: string }) => void = () => undefined
    service.create.mockImplementation(
      () => new Promise((resolve) => (resolveCreate = resolve)),
    )
    const { result } = renderAutosave()

    let first: Promise<string | null> = Promise.resolve(null)
    let second: Promise<string | null> = Promise.resolve(null)
    act(() => {
      first = result.current.autosave.save()
      second = result.current.autosave.save()
    })
    await act(async () => {
      await vi.waitFor(() => expect(service.create).toHaveBeenCalledTimes(1))
      resolveCreate({ id: 'd1' })
      await first
      await second
    })

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.update).toHaveBeenCalledTimes(1)
    expect(service.update).toHaveBeenCalledWith('d1', expect.any(Object))
  })

  it('discard deletes the saved draft and stops autosaving', async () => {
    const { result } = renderAutosave('d1')

    await act(() => result.current.autosave.discard())
    await typeName(result, 'After discard')
    await act(() => vi.advanceTimersByTimeAsync(1500))

    expect(service.delete).toHaveBeenCalledWith('d1')
    expect(service.create).not.toHaveBeenCalled()
    expect(result.current.autosave.draftId).toBeNull()
  })

  it('stop waits for pending saves and blocks new ones', async () => {
    const { result } = renderAutosave('d1')

    await typeName(result, 'Pending')
    let stoppedId: string | null = null
    await act(async () => {
      stoppedId = await result.current.autosave.stop()
    })
    await act(() => vi.advanceTimersByTimeAsync(1500))

    expect(stoppedId).toBe('d1')
    expect(service.update).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.autosave.save(true)).toBeNull()
    })
    expect(service.update).not.toHaveBeenCalled()
  })

  it('returns the current draft without saving when there is no business', async () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => {
        const form = useForm<Values>({
          defaultValues: { name: '', contact: '', color: '#34C759' },
        })
        return useDraftAutosave({
          entity: 'party',
          businessId: undefined,
          form,
          toFields: toPartyDraftFields,
          initialDraftId: 'draft-1',
        })
      },
      { wrapper },
    )

    await act(async () => {
      await expect(result.current.save()).resolves.toBe('draft-1')
    })
    expect(result.current.status).toBe('idle')
    expect(service.create).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
  })

  it('reports a failed save and permits a retry', async () => {
    const log = vi
      .spyOn(logger, 'error')
      .mockImplementationOnce(() => 'test-reference')
    const error = new Error('Storage unavailable')
    const { result } = renderAutosave()
    service.create.mockRejectedValueOnce(error)

    await act(async () => {
      await expect(result.current.autosave.save()).rejects.toThrow(
        'Storage unavailable',
      )
    })
    expect(result.current.autosave.status).toBe('error')

    await act(async () => {
      await expect(result.current.autosave.save()).resolves.toBe('d1')
    })
    expect(service.create).toHaveBeenCalledTimes(2)
    expect(result.current.autosave.status).toBe('saved')
    expect(log).toHaveBeenCalledExactlyOnceWith('Draft autosave failed', error)
  })

  it('discards unsaved state without deleting a draft row', async () => {
    const { result } = renderAutosave()

    await act(async () => result.current.autosave.discard())

    expect(service.delete).not.toHaveBeenCalled()
    await act(async () => {
      await expect(result.current.autosave.save()).resolves.toBeNull()
    })
    expect(service.create).not.toHaveBeenCalled()
  })
})
