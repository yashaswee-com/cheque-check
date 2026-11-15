import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BaseSyntheticEvent } from 'react'
import { useChequePublishConfirmation } from './use-cheque-publish-confirmation'

function setup() {
  const options = {
    step: 3,
    nextStep: vi.fn(),
    accountId: 'a1',
    chequeNumber: '123456',
    requiresConfirmation: true,
    confirmDuplicate: vi.fn().mockResolvedValue(true),
    submit: vi.fn().mockResolvedValue(undefined),
  }
  const hook = renderHook((props) => useChequePublishConfirmation(props), {
    initialProps: options,
  })
  const event = { preventDefault: vi.fn() } as Pick<
    BaseSyntheticEvent,
    'preventDefault'
  >
  const submit = () =>
    hook.result.current.handleSubmit(event as BaseSyntheticEvent)
  return { ...hook, options, submit, event }
}

describe('cheque publish confirmation', () => {
  it('advances intermediate steps and submits unconfirmed nonduplicate forms', async () => {
    const test = setup()
    test.rerender({ ...test.options, step: 1 })
    await act(test.submit)
    expect(test.options.nextStep).toHaveBeenCalledOnce()
    expect(test.options.submit).not.toHaveBeenCalled()
    test.rerender({ ...test.options, requiresConfirmation: false })
    await act(test.submit)
    expect(test.options.submit).toHaveBeenCalledWith(test.event)
  })
  it('requires acknowledgment for the current account and number', async () => {
    const test = setup()
    await act(test.submit)
    expect(test.options.confirmDuplicate).not.toHaveBeenCalled()
    act(() => test.result.current.setConfirmed(true))
    test.rerender({ ...test.options, chequeNumber: '654321' })
    expect(test.result.current.confirmed).toBe(false)
    await act(test.submit)
    expect(test.options.submit).not.toHaveBeenCalled()
    act(() => test.result.current.setConfirmed(true))
    await act(test.submit)
    expect(test.options.confirmDuplicate).toHaveBeenCalledWith('a1', '654321')
    expect(test.options.submit).toHaveBeenCalledOnce()
  })
  it('serializes confirmation and releases the lock after a failure', async () => {
    const test = setup()
    let finish!: (value: boolean) => void
    test.options.confirmDuplicate.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
    )
    act(() => test.result.current.setConfirmed(true))
    await act(async () => {
      const first = test.submit()
      await test.submit()
      expect(test.options.confirmDuplicate).toHaveBeenCalledOnce()
      finish(false)
      await first
    })
    expect(test.options.submit).not.toHaveBeenCalled()
    test.options.confirmDuplicate.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await expect(test.submit()).rejects.toThrow('offline')
    })
    await act(test.submit)
    expect(test.options.submit).toHaveBeenCalledOnce()
  })
})
