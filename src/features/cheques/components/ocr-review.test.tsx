import {
  fireEvent,
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { OcrReview } from './ocr-review'
import { OcrScanSheet } from './ocr-scan-sheet'
import type { useOcrExtraction } from '../hooks/use-ocr-extraction'
import type { ScanJob } from '@/validators/cheque-scan'

vi.mock('@/components/bank-selector', () => ({
  BankSelector: ({
    onValueChange,
  }: {
    onValueChange: (id: string) => void
  }) => (
    <button type="button" onClick={() => onValueChange('bank')}>
      Choose test bank
    </button>
  ),
}))

const job: ScanJob = {
  id: '10000000-0000-4000-8000-000000000001',
  draft_id: '10000000-0000-4000-8000-000000000002',
  business_id: '10000000-0000-4000-8000-000000000003',
  mode: 'Inward',
  image_url: '/api/storage/private-cheque-images/owner/image.jpg',
  status: 'ready_partial',
  error_code: null,
  credit_state: 'reserved',
  deadline_at: new Date().toISOString(),
  review_expires_at: new Date().toISOString(),
  details: {
    amount: 1250,
    cheque_number: '001234',
    cheque_date: null,
    payee_name: null,
    account_name: null,
    account_number: null,
    ifsc_code: null,
    bank_name: null,
  },
  reliability: {
    amount: { level: 'needs_review', reason: 'clear' },
    cheque_number: { level: 'needs_review', reason: 'clear' },
    cheque_date: { level: 'unusable', reason: 'missing' },
  },
}
function fixture(overrides: Partial<ReturnType<typeof useOcrExtraction>> = {}) {
  return {
    job,
    candidates: { parties: [], accounts: [] },
    errorCode: null,
    needsConsent: false,
    applied: false,
    modeMismatch: false,
    isExtracting: false,
    unmatchedEntities: null,
    setUnmatchedEntities: vi.fn(),
    createOptions: { party: false, account: false },
    setCreateOptions: vi.fn(),
    isCreatingInline: false,
    extractData: vi.fn(),
    handleInlineCreate: vi.fn(),
    retry: vi.fn(),
    recover: vi.fn(),
    cancel: vi.fn(),
    acknowledgeConsent: vi.fn(),
    accept: vi.fn(),
    chooseParty: vi.fn(),
    chooseAccount: vi.fn(),
    openCreate: vi.fn(),
    partyContact: '',
    setPartyContact: vi.fn(),
    allowDuplicate: false,
    setAllowDuplicate: vi.fn(),
    duplicateWarning: false,
    remap: vi.fn(),
    confirmDuplicate: vi.fn(),
    ...overrides,
  }
}
function show(
  scan = fixture(),
  props: Partial<ComponentProps<typeof OcrReview>> = {},
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OcrReview scan={scan} {...props} />
    </NextIntlClientProvider>,
  )
  return scan
}
afterEach(cleanup)
describe('scan review accessibility and actions', () => {
  it('requires explicit field verification before a credit-bearing partial acceptance', () => {
    const scan = show()
    const accept = screen.getByRole('button', {
      name: messages.Ocr.acceptCredit,
    })
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Amount/ }))
    expect(accept).toBeEnabled()
    fireEvent.click(accept)
    expect(scan.accept).toHaveBeenCalledWith(['amount'])
    expect(screen.getByRole('checkbox', { name: /Date/ })).toBeDisabled()
    expect(screen.getByText(messages.Ocr.credits.reserved)).toBeVisible()
  })
})

describe('guided review decisions', () => {
  it('only shows detail verification until fields have been applied', () => {
    show(
      fixture({
        candidates: {
          parties: [
            { id: 'party', name: 'Same Name', score: 0.8, reason: 'name' },
          ],
          accounts: [],
        },
      }),
    )
    expect(
      screen.queryByText(messages.Ocr.flow.matchesTitle),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Same Name/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(messages.Ocr.flow.evidence)).toBeVisible()
  })

  it('uses backend suggestions without exposing ranking scores as confidence', async () => {
    const scan = show(
      fixture({
        applied: true,
        candidates: {
          parties: [
            { id: 'one', name: 'Same Name', score: 0.8, reason: 'name' },
            { id: 'two', name: 'Same Name', score: 0.9, reason: 'bank' },
          ],
          accounts: [],
        },
      }),
      {
        partyOptions: [
          { value: 'one', label: 'Same Name (+911111111111)' },
          { value: 'two', label: 'Same Name (+912222222222)' },
        ],
        partyId: 'one',
      },
    )
    expect(screen.getByText(messages.Ocr.flow.multipleMatches)).toBeVisible()
    expect(screen.getByText(messages.Ocr.flow.noMatches)).toBeVisible()
    expect(screen.queryByText(/80\/100|90\/100/)).not.toBeInTheDocument()
    const first = screen.getByRole('button', {
      name: /Same Name \(\+911111111111\)/,
    })
    expect(first).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(
      screen.getByRole('button', { name: /Same Name \(\+912222222222\)/ }),
    )
    await waitFor(() => expect(scan.chooseParty).toHaveBeenCalledWith('two'))
  })

  it('makes returning to the form explicit and permits reviewing already applied details', () => {
    const onDone = vi.fn()
    show(fixture({ applied: true }), { onDone })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.done }),
    )
    expect(onDone).toHaveBeenCalledOnce()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.backDetails }),
    )
    expect(screen.getByText(messages.Ocr.applied)).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /Amount/ })).toBeDisabled()
  })

  it('checks unknown transport outcomes before offering a new paid scan', () => {
    const scan = show(fixture({ job: null, errorCode: 'SCAN_UNAVAILABLE' }))
    expect(
      screen.queryByRole('button', { name: messages.Ocr.retry }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.Ocr.recover }))
    expect(scan.recover).toHaveBeenCalledOnce()
    expect(scan.retry).not.toHaveBeenCalled()
  })

  it('does not make the user verify only uncertain fields to advance', () => {
    show(
      fixture({
        job: {
          ...job,
          reliability: {
            amount: { level: 'needs_review', reason: 'uncertain' },
          },
        },
      }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Amount/ }))
    expect(
      screen.getByRole('button', { name: messages.Ocr.acceptCredit }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: messages.Ocr.manual }),
    ).toBeEnabled()
  })

  it('keeps duplicate-cheque acknowledgment available even for a failed scan', () => {
    show(fixture({ job: { ...job, status: 'failed' } }), {
      duplicateConfirmation: (
        <label>
          <input type="checkbox" />
          Confirm separate cheque
        </label>
      ),
    })
    expect(
      screen.getByRole('checkbox', { name: 'Confirm separate cheque' }),
    ).toBeVisible()
    expect(screen.getByText(messages.Ocr.states.failed)).toBeVisible()
  })

  it('requires explicit selection, contact and separate-record acknowledgment for creation', () => {
    function Creation() {
      const [createOptions, setCreateOptions] = useState({
        party: false,
        account: false,
      })
      const [partyContact, setPartyContact] = useState('')
      const [allowDuplicate, setAllowDuplicate] = useState(false)
      return (
        <OcrReview
          scan={fixture({
            applied: true,
            unmatchedEntities: { payee_name: 'Same Name' },
            createOptions,
            setCreateOptions,
            partyContact,
            setPartyContact,
            duplicateWarning: true,
            allowDuplicate,
            setAllowDuplicate,
          })}
        />
      )
    }
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Creation />
      </NextIntlClientProvider>,
    )
    const create = screen.getByRole('button', {
      name: messages.Cheques.createSelected,
    })
    expect(create).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Create party: Same Name/ }),
    )
    expect(create).toBeDisabled()
    fireEvent.change(
      screen.getByRole('textbox', { name: messages.Ocr.contact }),
      { target: { value: '+919999999999' } },
    )
    expect(create).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: messages.Ocr.duplicateConfirm }),
    )
    expect(create).toBeEnabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('provides a way back when extraction has no usable entity creation data', () => {
    const scan = show(fixture({ applied: true, unmatchedEntities: {} }))
    expect(screen.getByText(messages.Ocr.flow.noCreationData)).toBeVisible()
    expect(
      screen.getByRole('button', { name: messages.Cheques.createSelected }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.backToMatches }),
    )
    expect(scan.setUnmatchedEntities).toHaveBeenCalledWith(null)
  })
})

describe('scan bottom sheet', () => {
  function showSheet(scan = fixture(), initialOpen = false) {
    const onUpload = vi.fn()
    const onRemove = vi.fn()
    function SheetHarness() {
      const [open, onOpenChange] = useState(initialOpen)
      return (
        <OcrScanSheet
          scan={scan}
          imageUrl={job.image_url}
          isUploading={false}
          open={open}
          onOpenChange={onOpenChange}
          onUpload={onUpload}
          onRemove={onRemove}
        />
      )
    }
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SheetHarness />
      </NextIntlClientProvider>,
    )
    return { onUpload, onRemove }
  }

  it('keeps the form compact and preserves verification choices after closing and reopening', async () => {
    const scan = fixture()
    showSheet(scan)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /AI cheque scan/ }))
    const dialog = screen.getByRole('dialog', { name: messages.Ocr.title })
    expect(dialog).toHaveAttribute('data-monitoring-private')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Amount/ }))
    fireEvent.click(
      within(dialog).getByRole('button', { name: messages.Common.close }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(scan.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /AI cheque scan/ }))
    expect(screen.getByRole('checkbox', { name: /Amount/ })).toBeChecked()
  })

  it('lets an ongoing scan continue when the sheet is dismissed', async () => {
    const scan = fixture({
      job: { ...job, status: 'processing' },
      isExtracting: true,
    })
    showSheet(scan, true)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.closeForNow }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(scan.cancel).not.toHaveBeenCalled()
    expect(scan.retry).not.toHaveBeenCalled()
  })

  it('offers retake and removal inside the sheet without silently starting another scan', () => {
    const scan = fixture({
      job: { ...job, status: 'timed_out', credit_state: 'released' },
    })
    const actions = showSheet(scan, true)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.replacePhoto }),
    )
    expect(actions.onUpload).toHaveBeenCalledOnce()
    expect(scan.retry).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Ocr.flow.removePhoto }),
    )
    expect(actions.onRemove).toHaveBeenCalledOnce()
  })
})
describe('scan recovery and safety', () => {
  it('explains provider processing and offers manual entry without consent', () => {
    const scan = show(fixture({ job: null, needsConsent: true }))
    expect(screen.getByText(messages.Ocr.disclosure)).toBeVisible()
    expect(scan.acknowledgeConsent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: messages.Ocr.manual }))
    expect(scan.cancel).toHaveBeenCalledOnce()
  })
  it('does not present unusable or timed-out scans as success', () => {
    show(
      fixture({
        job: { ...job, status: 'timed_out', credit_state: 'released' },
      }),
    )
    expect(screen.getByText(messages.Ocr.states.timed_out)).toBeVisible()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: messages.Ocr.retry }),
    ).toBeEnabled()
  })
  it('offers direction remapping without another paid scan', () => {
    const scan = show(fixture({ modeMismatch: true }))
    fireEvent.click(screen.getByRole('button', { name: messages.Ocr.remap }))
    expect(scan.remap).toHaveBeenCalledOnce()
    expect(scan.retry).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
  it('does not render extracted text as HTML and blocks session recording of review content', () => {
    show(
      fixture({
        job: {
          ...job,
          details: { ...job.details!, cheque_number: '<script>bad()</script>' },
        },
      }),
    )
    expect(document.querySelector('section script')).toBeNull()
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-monitoring-private',
    )
  })
})
