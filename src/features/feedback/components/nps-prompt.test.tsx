import type { ReactNode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NpsPrompt } from './nps-prompt'

const state = vi.hoisted(() => ({
  submit: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
  record: vi.fn(),
  desktop: false,
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('../services/nps.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/nps.service')>()),
  getNpsService: () => ({ submit: state.submit }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: state.toast } }))
vi.mock('@/lib/logger', () => ({ logger: { error: state.error } }))
vi.mock('@/lib/monitoring/telemetry', () => ({
  recordFeedbackSubmission: state.record,
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="desktop-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))
beforeEach(() => {
  vi.clearAllMocks()
  state.desktop = false
  state.submit.mockResolvedValue(undefined)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: state.desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const context = { businessId: 'b1', chequeId: 'c1' }

describe('NpsPrompt', () => {
  it('does not show feedback without a context', () => {
    const { container } = render(<NpsPrompt context={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([false, true])(
    'uses the appropriate viewport presentation (desktop=%s)',
    (desktop) => {
      state.desktop = desktop
      render(<NpsPrompt context={context} onClose={vi.fn()} />)
      expect(
        screen.getByTestId(desktop ? 'desktop-dialog' : 'mobile-sheet'),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(11)
      expect(screen.getByTestId('nps-submit-button')).toBeDisabled()
    },
  )

  it.each([
    [0, 'detractor'],
    [7, 'passive'],
    [10, 'promoter'],
  ] as const)(
    'collects score %s and its category follow-up',
    async (score, category) => {
      const onClose = vi.fn()
      render(<NpsPrompt context={context} onClose={onClose} />)
      fireEvent.click(screen.getByTestId(`nps-score-${score}`))
      expect(screen.getByTestId(`nps-score-${score}`)).toHaveAttribute(
        'aria-checked',
        'true',
      )
      fireEvent.change(screen.getByLabelText(`followUp.${category}`), {
        target: { value: 'Useful app' },
      })
      fireEvent.click(screen.getByTestId('nps-submit-button'))
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
      expect(state.submit).toHaveBeenCalledWith({
        ...context,
        score,
        comment: 'Useful app',
      })
      expect(state.record).toHaveBeenCalledWith({
        business_id: 'b1',
        entity_type: 'cheque',
        entity_id: 'c1',
      })
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      )
    },
  )

  it('reports submission failures and keeps the entered score for retry', async () => {
    const failure = new Error('offline')
    state.submit.mockRejectedValueOnce(failure)
    const onClose = vi.fn()
    render(<NpsPrompt context={context} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('nps-score-8'))
    fireEvent.click(screen.getByTestId('nps-submit-button'))
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        'Failed to submit NPS response',
        failure,
      ),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(state.record).not.toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
    expect(screen.getByTestId('nps-submit-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('nps-submit-button'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('dismisses without submitting', () => {
    const onClose = vi.fn()
    render(<NpsPrompt context={context} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('nps-dismiss-button'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(state.submit).not.toHaveBeenCalled()
  })
})
