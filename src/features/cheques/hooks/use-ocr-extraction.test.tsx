import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Bank, Party } from '@/types'
import { useOcrExtraction } from './use-ocr-extraction'

const mocks = vi.hoisted(() => ({
  monitoredFetch: vi.fn(),
  createParty: vi.fn(),
  createAccount: vi.fn(),
  getFile: vi.fn(),
  toastAdd: vi.fn(),
  toastClose: vi.fn(),
  loggerError: vi.fn(),
  translate: (key: string) => key,
}))

vi.mock('@/lib/monitoring/telemetry', () => ({
  monitoredFetch: mocks.monitoredFetch,
}))
vi.mock('@/features/parties/services/party.service', () => ({
  partyService: { create: mocks.createParty },
}))
vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: { create: mocks.createAccount },
}))
vi.mock('@/lib/scan-store', () => ({
  ScanStore: { getFile: mocks.getFile },
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd, close: mocks.toastClose },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError },
}))
vi.mock('next-intl', () => ({
  // next-intl translators are referentially stable; the hook's effect depends on them.
  useTranslations: () => mocks.translate,
}))

const response = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  }) as unknown as Response

const extraction = (overrides: Record<string, unknown> = {}) => ({
  amount: 1250,
  cheque_number: '123456',
  cheque_date: '2026-10-30',
  payee_name: 'Acme Traders',
  account_number: 'XX 1234 5678',
  account_name: 'Acme Current',
  ifsc_code: 'BANK0001234',
  bank_name: 'Example Bank',
  ...overrides,
})

const party = { id: 'party-1', name: 'Acme Traders' } as Party
const account = {
  id: 'account-1',
  account_name: 'Acme Current',
  account_number: '12345678',
} as Account
const bank = { id: 'bank-1', name: 'Example Bank' } as Bank

function setup({
  businessId = 'business-1',
  type = 'Outward',
  parties = [party],
  accounts = [account],
  banks = [bank],
  imageUrlParam = null,
  upload = vi.fn().mockResolvedValue(null),
}: {
  businessId?: string
  type?: string
  parties?: Party[]
  accounts?: Account[]
  banks?: Bank[]
  imageUrlParam?: string | null
  upload?: (file: File) => Promise<string | null>
} = {}) {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const values: Record<string, unknown> = { type, party_id: '', account_id: '' }
  const watch = vi.fn((name: string) => values[name])
  const setValue = vi.fn((name: string, value: unknown) => {
    values[name] = value
  })
  const hook = renderHook(
    () =>
      useOcrExtraction({
        businessId,
        imageUrlParam,
        parties,
        accounts,
        banks,
        watch: watch as never,
        setValue: setValue as never,
        handleImageUpload: upload,
      }),
    { wrapper },
  )
  return { ...hook, queryClient, values, watch, setValue, upload }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getFile.mockReturnValue(null)
  mocks.toastAdd.mockReturnValue('loading-toast')
  mocks.monitoredFetch.mockResolvedValue(response(extraction()))
  mocks.createParty.mockResolvedValue({ id: 'created-party' })
  mocks.createAccount.mockResolvedValue({ id: 'created-account' })
})

afterEach(() => {
  cleanup()
})

describe('useOcrExtraction', () => {
  it('extracts cheque values and fuzzy-matches the payee and account number', async () => {
    const { result, setValue } = setup()

    await act(async () => result.current.extractData('/private/scan.png'))

    expect(mocks.monitoredFetch).toHaveBeenCalledWith(
      '/api/ocr/cheque',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ imageUrl: '/private/scan.png' }),
      }),
    )
    expect(setValue).toHaveBeenCalledWith('image_url', '/private/scan.png')
    expect(setValue).toHaveBeenCalledWith('amount', 1250)
    expect(setValue).toHaveBeenCalledWith('cheque_number', '123456')
    expect(setValue).toHaveBeenCalledWith('cheque_date', '2026-10-30')
    expect(setValue).toHaveBeenCalledWith('party_id', 'party-1')
    expect(setValue).toHaveBeenCalledWith('account_id', 'account-1')
    expect(result.current.unmatchedEntities).toBeNull()
    expect(result.current.isExtracting).toBe(false)
    expect(mocks.toastClose).toHaveBeenCalledOnce()
    expect(mocks.toastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'success',
        description: 'extractionSuccess',
      }),
    )
  })

  it('uses the account holder as the inward party and leaves absent OCR values untouched', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          amount: null,
          cheque_number: null,
          cheque_date: null,
          payee_name: 'Ignored payee',
          account_name: 'Acme Current',
          account_number: null,
        }),
      ),
    )
    const { result, setValue } = setup({
      type: 'Inward',
      parties: [{ id: 'party-2', name: 'Acme Current' } as Party],
    })

    await act(async () => result.current.extractData('/scan.png'))

    expect(setValue).toHaveBeenCalledWith('party_id', 'party-2')
    expect(setValue).not.toHaveBeenCalledWith('amount', expect.anything())
    expect(setValue).not.toHaveBeenCalledWith(
      'cheque_number',
      expect.anything(),
    )
    expect(result.current.unmatchedEntities).toBeNull()
  })

  it('offers inline creation when party/account cannot be matched and resolves a bank name', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: 'New Customer',
          account_name: 'New Account',
          account_number: '987654321',
        }),
      ),
    )
    const { result } = setup({ parties: [], accounts: [] })

    await act(async () => result.current.extractData('/scan.png'))

    expect(result.current.unmatchedEntities).toEqual({
      payee_name: 'New Customer',
      account_name: 'New Account',
      account_number: '987654321',
      ifsc_code: 'BANK0001234',
      bank_name: 'Example Bank',
      bank_id: 'bank-1',
    })
    expect(result.current.createOptions).toEqual({ party: true, account: true })
  })

  it('creates selected party and account, updates form fields, and invalidates their lists', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: 'New Customer',
          account_name: 'New Account',
          account_number: '987654321',
        }),
      ),
    )
    const { result, queryClient, setValue } = setup({
      parties: [],
      accounts: [],
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(async () => result.current.extractData('/scan.png'))
    await act(async () => result.current.handleInlineCreate())

    expect(mocks.createParty).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'business-1',
        name: 'New Customer',
        contact: '0000000000',
      }),
    )
    expect(mocks.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'business-1',
        bank_id: 'bank-1',
        account_name: 'New Account',
        account_number: '987654321',
      }),
    )
    expect(setValue).toHaveBeenCalledWith('party_id', 'created-party')
    expect(setValue).toHaveBeenCalledWith('account_id', 'created-account')
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(result.current.unmatchedEntities).toBeNull()
    expect(result.current.isCreatingInline).toBe(false)
  })

  it('requires a bank before creating an unmatched account and preserves the unmatched data', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: null,
          account_name: 'Unmatched Account',
          account_number: '987654321',
          bank_name: 'Unknown Bank',
        }),
      ),
    )
    const { result } = setup({ accounts: [], parties: [], banks: [] })

    await act(async () => result.current.extractData('/scan.png'))
    await act(async () => result.current.handleInlineCreate())

    expect(mocks.createAccount).not.toHaveBeenCalled()
    expect(result.current.unmatchedEntities).not.toBeNull()
    expect(result.current.isCreatingInline).toBe(false)
    expect(mocks.toastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        description: 'selectBankForAccount',
      }),
    )
  })

  it('reports non-OK responses, invalid payloads, and inline service errors', async () => {
    const { result } = setup()
    mocks.monitoredFetch.mockResolvedValue(
      response({ error: 'OCR quota reached' }, false, 429),
    )

    await act(async () => result.current.extractData('/scan.png'))
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'OCR Error',
      expect.objectContaining({ message: 'OCR quota reached' }),
    )
    expect(result.current.isExtracting).toBe(false)

    mocks.monitoredFetch.mockResolvedValue(response({ amount: 'not a number' }))
    await act(async () => result.current.extractData('/scan.png'))
    expect(mocks.toastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        description: 'extractionFailed',
      }),
    )

    mocks.monitoredFetch.mockResolvedValue(
      response(extraction({ payee_name: 'Unmatched' })),
    )
    await act(async () => result.current.extractData('/scan.png'))
    mocks.createParty.mockRejectedValueOnce(
      new Error('Party service unavailable'),
    )
    await act(async () => result.current.handleInlineCreate())
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Inline creation error',
      expect.objectContaining({ message: 'Party service unavailable' }),
    )
    expect(result.current.isCreatingInline).toBe(false)
  })

  it('processes a pending scan once and skips empty or duplicate extraction requests', async () => {
    const file = new File(['image'], 'cheque.png', { type: 'image/png' })
    mocks.getFile.mockReturnValue(file)
    const upload = vi.fn().mockResolvedValue('/uploaded/cheque.png')
    const { result } = setup({ upload })

    await waitFor(() => expect(mocks.monitoredFetch).toHaveBeenCalledOnce())
    expect(upload).toHaveBeenCalledWith(file)
    expect(result.current.isExtracting).toBe(false)

    await act(async () => result.current.extractData(''))
    expect(mocks.monitoredFetch).toHaveBeenCalledOnce()
  })

  it('matches an outward account by name when the extracted account number is absent', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          account_name: 'Acme Current',
          account_number: null,
        }),
      ),
    )
    const { result, setValue } = setup({
      accounts: [
        account,
        {
          ...account,
          id: 'account-2',
          account_name: 'Other Current',
          account_number: '87654321',
        },
      ],
      parties: [
        party,
        { ...party, id: 'party-2', name: 'Acme Traders Limited' },
      ],
    })

    await act(async () => result.current.extractData('/scan-by-name.png'))

    expect(setValue).toHaveBeenCalledWith('account_id', 'account-1')
    expect(result.current.unmatchedEntities).toBeNull()
  })

  it('matches a short local account suffix and resolves a partial bank name', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          account_number: '12345678',
          account_name: 'Different Account',
          payee_name: 'Unmatched Payee',
          bank_name: 'Ex',
          ifsc_code: null,
        }),
      ),
    )
    const { result } = setup({
      parties: [],
      accounts: [{ ...account, account_number: '5678' }],
      banks: [{ ...bank, name: 'Example Bank' }],
    })

    await act(async () => result.current.extractData('/partial-bank.png'))

    expect(result.current.unmatchedEntities).toMatchObject({
      account_name: 'Different Account',
      account_number: undefined,
      bank_id: 'bank-1',
      payee_name: 'Unmatched Payee',
    })
  })

  it('creates an unnamed account using the safe fallback and skips unchecked entities', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: null,
          account_name: null,
          account_number: '987654321',
          ifsc_code: null,
          bank_name: 'Example Bank',
        }),
      ),
    )
    const { result } = setup({ parties: [], accounts: [], banks: [bank] })

    await act(async () => result.current.extractData('/unnamed-account.png'))
    act(() => result.current.setCreateOptions({ party: true, account: false }))
    await act(async () => result.current.handleInlineCreate())
    expect(mocks.createParty).not.toHaveBeenCalled()
    expect(mocks.createAccount).not.toHaveBeenCalled()

    await act(async () => result.current.extractData('/unnamed-account.png'))
    act(() => result.current.setCreateOptions({ party: false, account: true }))
    await act(async () => result.current.handleInlineCreate())
    expect(mocks.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account_name: 'Scanned Account',
        ifsc_code: null,
      }),
    )
  })

  it('does not close a toast when no loading-toast id was returned', async () => {
    mocks.toastAdd.mockReturnValueOnce(null)
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: 'New Party',
          account_number: '987654321',
        }),
      ),
    )
    const { result } = setup({ parties: undefined, accounts: undefined })

    await act(async () => result.current.extractData('/scan-without-toast.png'))

    expect(mocks.toastClose).not.toHaveBeenCalled()
    expect(result.current.unmatchedEntities).not.toBeNull()
  })

  it('retains a matched party and nullable OCR fields for an unmatched account', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: 'Acme Traders',
          account_name: null,
          account_number: '987654321',
          ifsc_code: null,
          bank_name: null,
        }),
      ),
    )
    const { result } = setup({
      parties: [party],
      accounts: [],
      banks: undefined,
    })

    await act(async () => result.current.extractData('/missing-bank.png'))

    expect(result.current.unmatchedEntities).toEqual({
      payee_name: undefined,
      account_name: undefined,
      account_number: '987654321',
      ifsc_code: undefined,
      bank_name: undefined,
      bank_id: '',
    })
  })

  it('preserves an unmatched payee when OCR cannot identify an account number', async () => {
    mocks.monitoredFetch.mockResolvedValue(
      response(
        extraction({
          payee_name: 'Unmatched Payee',
          account_name: null,
          account_number: null,
          ifsc_code: null,
          bank_name: null,
        }),
      ),
    )
    const { result } = setup({
      parties: [],
      accounts: [],
      banks: undefined,
    })

    await act(async () => result.current.extractData('/missing-account.png'))

    expect(result.current.unmatchedEntities).toEqual({
      payee_name: 'Unmatched Payee',
      account_name: undefined,
      account_number: undefined,
      ifsc_code: undefined,
      bank_name: undefined,
      bank_id: '',
    })
  })

  it('does not close a failed extraction toast when no toast id is returned', async () => {
    mocks.toastAdd.mockReturnValueOnce(null)
    mocks.monitoredFetch.mockResolvedValue(response({}, false, 503))
    const { result } = setup()

    await act(async () =>
      result.current.extractData('/failed-without-toast.png'),
    )

    expect(mocks.toastClose).not.toHaveBeenCalled()
    expect(result.current.isExtracting).toBe(false)
  })

  it('skips a pending scan when image upload does not return a URL', async () => {
    mocks.getFile.mockReturnValue(
      new File(['image'], 'cheque.png', { type: 'image/png' }),
    )
    const upload = vi.fn().mockResolvedValue(null)
    setup({ upload })

    await waitFor(() => expect(upload).toHaveBeenCalledOnce())
    expect(mocks.monitoredFetch).not.toHaveBeenCalled()
  })

  it('uses the generic status message when an error response body cannot be read', async () => {
    mocks.monitoredFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    })
    const { result } = setup()

    await act(async () => result.current.extractData('/broken-response.png'))

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'OCR Error',
      expect.objectContaining({ message: 'Failed to extract data (503)' }),
    )
    expect(result.current.isExtracting).toBe(false)
  })

  it('extracts an image URL supplied by navigation and ignores inline creation without a target', async () => {
    const { result } = setup({ imageUrlParam: '/from-navigation.png' })

    await waitFor(() =>
      expect(mocks.monitoredFetch).toHaveBeenCalledWith(
        '/api/ocr/cheque',
        expect.objectContaining({
          body: JSON.stringify({ imageUrl: '/from-navigation.png' }),
        }),
      ),
    )
    await waitFor(() => expect(result.current.isExtracting).toBe(false))
    expect(mocks.monitoredFetch).toHaveBeenCalledOnce()
    await act(async () => result.current.handleInlineCreate())
    expect(mocks.createParty).not.toHaveBeenCalled()
    expect(mocks.createAccount).not.toHaveBeenCalled()
  })
})
