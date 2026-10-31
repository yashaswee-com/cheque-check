import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorView } from './error-view'
import { renderToString } from 'react-dom/server'

const state = vi.hoisted(() => ({
  reference: undefined as string | undefined,
  listeners: new Set<() => void>(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/logger', () => ({
  getErrorReference: () => state.reference,
  subscribeErrorReferences: (listener: () => void) => {
    state.listeners.add(listener)
    return () => state.listeners.delete(listener)
  },
}))
beforeEach(() => {
  state.reference = undefined
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ErrorView', () => {
  it('provides an explicit support reference during server rendering', () => {
    expect(
      renderToString(<ErrorView supportReference="server-reference" />),
    ).toContain('server-reference')
  })
  it('renders safe default text rather than the raw exception message', () => {
    render(<ErrorView error={new Error('private account details')} />)
    expect(screen.getByText('unexpectedError')).toBeInTheDocument()
    expect(
      screen.queryByText('private account details'),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('support-reference')).not.toBeInTheDocument()
  })

  it('supports an explicit description and retry callback', () => {
    const reset = vi.fn()
    render(
      <ErrorView
        title="Cannot load"
        description="Please try again later"
        reset={reset}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Cannot load' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('prefers an explicit support reference over captured IDs and digests', () => {
    state.reference = 'captured'
    render(
      <ErrorView
        supportReference="explicit"
        error={Object.assign(new Error(), { digest: 'digest' })}
      />,
    )
    expect(screen.getByTestId('support-reference')).toHaveTextContent(
      'explicit',
    )
  })

  it('updates the reference when the error is captured and unsubscribes on unmount', () => {
    const { unmount } = render(
      <ErrorView error={Object.assign(new Error(), { digest: 'digest' })} />,
    )
    expect(screen.getByTestId('support-reference')).toHaveTextContent('digest')
    act(() => {
      state.reference = 'new-capture'
      state.listeners.forEach((listener) => listener())
    })
    expect(screen.getByTestId('support-reference')).toHaveTextContent(
      'new-capture',
    )
    unmount()
    expect(state.listeners.size).toBe(0)
  })

  it('copies only the support reference and announces clipboard success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<ErrorView supportReference="safe-reference" />)
    fireEvent.click(screen.getByRole('button', { name: 'copyReference' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'copied' }),
      ).toBeInTheDocument(),
    )
    expect(writeText).toHaveBeenCalledExactlyOnceWith('safe-reference')
  })

  it('does not announce success when copying the reference fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<ErrorView supportReference="safe-reference" />)
    fireEvent.click(screen.getByRole('button', { name: 'copyReference' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(
      screen.getByRole('button', { name: 'copyReference' }),
    ).toBeInTheDocument()
  })
})
