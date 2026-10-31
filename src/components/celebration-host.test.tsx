import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CelebrationHost } from './celebration-host'
import { renderToString } from 'react-dom/server'

const state = vi.hoisted(() => ({
  pathname: '/cheques',
  pending: null as null | {
    target: string
    cheque?: { id: string; businessId: string }
  },
  celebrate: vi.fn(),
  clear: vi.fn(),
  shouldPrompt: vi.fn(),
  error: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@/lib/celebrate', () => ({
  subscribeCelebrations: () => () => {},
  getPendingCelebration: () => state.pending,
  celebrate: state.celebrate,
  clearPendingCelebration: state.clear,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: state.error } }))
vi.mock('@/features/feedback', () => ({
  getNpsService: () => ({ shouldPrompt: state.shouldPrompt }),
  NpsPrompt: ({
    context,
    onClose,
  }: {
    context: { chequeId: string; businessId: string } | null
    onClose: () => void
  }) =>
    context ? (
      <button onClick={onClose}>
        {context.chequeId} {context.businessId}
      </button>
    ) : null,
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  state.pending = null
  state.shouldPrompt.mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CelebrationHost', () => {
  it('does not expose pending client celebrations during server rendering', () => {
    state.pending = {
      target: '/cheques',
      cheque: { id: 'c1', businessId: 'b1' },
    }
    expect(renderToString(<CelebrationHost />)).toBe('')
    expect(state.celebrate).not.toHaveBeenCalled()
  })
  it('ignores absent celebrations and those targeting another route', () => {
    const { rerender } = render(<CelebrationHost />)
    state.pending = { target: '/accounts' }
    rerender(<CelebrationHost />)
    expect(state.celebrate).not.toHaveBeenCalled()
    expect(state.shouldPrompt).not.toHaveBeenCalled()
  })

  it('consumes a matching non-cheque celebration without requesting feedback', () => {
    state.pending = { target: '/cheques' }
    render(<CelebrationHost />)
    expect(state.clear).toHaveBeenCalledOnce()
    expect(state.celebrate).toHaveBeenCalledOnce()
    expect(state.shouldPrompt).not.toHaveBeenCalled()
  })

  it('waits 1500ms before checking feedback eligibility and allows dismissal', async () => {
    state.pending = {
      target: '/cheques',
      cheque: { id: 'c1', businessId: 'b1' },
    }
    render(<CelebrationHost />)
    await act(() => vi.advanceTimersByTimeAsync(1499))
    expect(state.shouldPrompt).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(state.shouldPrompt).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'c1 b1' }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not show ineligible feedback and logs eligibility failures', async () => {
    state.pending = {
      target: '/cheques',
      cheque: { id: 'c1', businessId: 'b1' },
    }
    state.shouldPrompt.mockResolvedValueOnce(false)
    const { unmount } = render(<CelebrationHost />)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()
    const failure = new Error('offline')
    state.shouldPrompt.mockRejectedValueOnce(failure)
    render(<CelebrationHost />)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(state.error).toHaveBeenCalledWith(
      'Failed to check NPS eligibility',
      failure,
    )
  })
})
