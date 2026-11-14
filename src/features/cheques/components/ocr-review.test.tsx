import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { OcrReview } from './ocr-review'
import type { useOcrExtraction } from '../hooks/use-ocr-extraction'
import type { ScanJob } from '@/validators/cheque-scan'

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
function show(scan = fixture()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OcrReview scan={scan} />
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
