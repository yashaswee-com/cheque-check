import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChequeFormValues } from '@/types'
import { useOcrExtraction } from './use-ocr-extraction'
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  file: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/monitoring/telemetry', () => ({ monitoredFetch: mocks.fetch }))
vi.mock('@/lib/scan-store', () => ({ ScanStore: { getFile: mocks.file } }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))
vi.mock('@/components/ui/toast', () => ({ toast: { add: vi.fn() } }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const owner = '10000000-0000-4000-8000-000000000001'
const id = '10000000-0000-4000-8000-000000000002'
const image = `/api/storage/private-cheque-images/${owner}/image.jpg`
const details = {
  amount: 1500,
  cheque_number: '001234',
  cheque_date: '2026-11-14',
  payee_name: 'Payee',
  account_number: '123456789',
  account_name: 'Drawer',
  ifsc_code: 'ABCD0ABC123',
  bank_name: 'Bank',
}
const job = {
  id,
  image_url: image,
  draft_id: id,
  business_id: owner,
  mode: 'Inward',
  status: 'ready_partial',
  details,
  error_code: null,
  reliability: Object.fromEntries(
    Object.keys(details).map((field) => [
      field,
      { level: 'needs_review', reason: 'clear' },
    ]),
  ),
  deadline_at: new Date(Date.now() + 7000).toISOString(),
  review_expires_at: new Date(Date.now() + 86400000).toISOString(),
  credit_state: 'reserved',
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status })
function setup(
  enabled: boolean | undefined = true,
  initialImage: string | null = null,
) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => {
      const form = useForm<ChequeFormValues>({
        defaultValues: {
          amount: 0,
          cheque_number: '',
          cheque_date: '',
          type: 'Inward',
          party_id: '',
          account_id: '',
          image_url: initialImage,
        },
      })
      const scan = useOcrExtraction({
        businessId: owner,
        imageUrlParam: null,
        parties: [],
        accounts: [],
        banks: [],
        watch: form.watch,
        setValue: form.setValue,
        handleImageUpload: vi.fn(),
        isLoadingDraft: false,
        aiScanEnabled: enabled,
      })
      return { scan, form }
    },
    { wrapper },
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.file.mockReturnValue(null)
  mocks.fetch.mockImplementation(async (_: string, init: RequestInit) => {
    const action = JSON.parse(String(init.body))
    if (action.action === 'candidates')
      return response({ parties: [], accounts: [] })
    if (action.action === 'accept')
      return response({
        ...job,
        status: 'accepted_partial',
        credit_state: 'charged',
      })
    return response(job)
  })
})
afterEach(cleanup)
describe('durable scan client', () => {
  it('does not send disabled-mode uploads to AI', async () => {
    const { result } = setup(false)
    await act(() => result.current.scan.extractData(image))
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(result.current.form.getValues('image_url')).toBe(image)
  })
  it('requires explicit review of partial results and applies verified fields', async () => {
    const { result } = setup()
    await act(() => result.current.scan.extractData(image))
    expect(result.current.form.getValues('amount')).toBe(0)
    expect(result.current.scan.job?.status).toBe('ready_partial')
    await act(() => result.current.scan.accept(['amount', 'cheque_number']))
    expect(result.current.form.getValues('amount')).toBe(1500)
    expect(result.current.form.getValues('cheque_number')).toBe('001234')
    expect(result.current.scan.job?.credit_state).toBe('charged')
  })
  it('does not overwrite manual edits made during inference', async () => {
    let finish!: (value: Response) => void
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result } = setup()
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.scan.extractData(image)
    })
    act(() => result.current.form.setValue('amount', 42))
    await act(async () => {
      finish(response(job))
      await pending
    })
    await act(() => result.current.scan.accept(['amount', 'cheque_number']))
    expect(result.current.form.getValues('amount')).toBe(42)
    expect(result.current.form.getValues('cheque_number')).toBe('001234')
  })
  it('recovers persisted scans without starting another provider call or overwriting populated fields', async () => {
    const { result } = setup(true, image)
    await waitFor(() => expect(result.current.scan.job?.id).toBe(id))
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).action).toBe('read')
    expect(
      mocks.fetch.mock.calls.some(
        ([, init]) => JSON.parse(init.body).action === 'start',
      ),
    ).toBe(false)
  })
  it('does not apply an obsolete image response', async () => {
    let finish!: (value: Response) => void
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result } = setup()
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.scan.extractData(image)
    })
    act(() => result.current.form.setValue('image_url', null))
    await act(async () => {
      finish(
        response({ ...job, status: 'ready_high', credit_state: 'charged' }),
      )
      await pending
    })
    expect(result.current.form.getValues('amount')).toBe(0)
    expect(result.current.scan.job).toBeNull()
  })
  it('reuses the idempotency key after uncertain request failure', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('network disconnected'))
    const { result } = setup()
    await act(() => result.current.scan.extractData(image))
    await act(() => result.current.scan.retry())
    const starts = mocks.fetch.mock.calls
      .map(([, init]) => JSON.parse(init.body))
      .filter((body) => body.action === 'start')
    expect(starts).toHaveLength(2)
    expect(starts[0].key).toBe(starts[1].key)
  })
  it('shows consent required without silently acknowledging it', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'CONSENT_REQUIRED' }), {
        status: 403,
      }),
    )
    const { result } = setup()
    await act(() => result.current.scan.extractData(image))
    expect(result.current.scan.needsConsent).toBe(true)
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it('does not select fuzzy account or party candidates automatically', async () => {
    mocks.fetch.mockImplementation(async (_: string, init: RequestInit) =>
      JSON.parse(String(init.body)).action === 'candidates'
        ? response({
            parties: [{ id, name: 'Drawer', score: 0.95, reason: 'name' }],
            accounts: [
              {
                id,
                name: 'Account',
                score: 0.99,
                reason: 'name',
                exact: false,
              },
            ],
          })
        : response(job),
    )
    const { result } = setup()
    await act(() => result.current.scan.extractData(image))
    expect(result.current.form.getValues('party_id')).toBe('')
    expect(result.current.form.getValues('account_id')).toBe('')
    act(() => result.current.scan.openCreate())
    expect(
      result.current.scan.unmatchedEntities?.account_number,
    ).toBeUndefined()
    expect(result.current.scan.unmatchedEntities?.payee_name).toBe('Drawer')
  })
  it('selects only a unique server-confirmed exact account match', async () => {
    mocks.fetch.mockImplementation(async (_: string, init: RequestInit) =>
      JSON.parse(String(init.body)).action === 'candidates'
        ? response({
            parties: [],
            accounts: [
              { id, name: 'Account', score: 1, reason: 'exact', exact: true },
            ],
          })
        : response(job),
    )
    const { result } = setup()
    await act(() => result.current.scan.extractData(image))
    expect(result.current.form.getValues('account_id')).toBe(id)
  })
})
