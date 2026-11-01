import { Suspense, lazy, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { NextIntlClientProvider } from 'next-intl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import CreateChequePage from './cheques/create/page'
import EditChequePage from './cheques/[id]/edit/page'
import ChequeDetailPage from './cheques/[id]/page'
import ChequesPage from './cheques/page'
import type { DraftSaveStatus } from '@/features/drafts/hooks/use-draft-autosave'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
  flush: vi.fn(),
  upload: vi.fn(),
  extract: vi.fn(),
  inline: vi.fn(),
  save: vi.fn(),
  navigate: vi.fn(),
  continue: vi.fn(),
  trigger: vi.fn(),
  require: vi.fn(),
  verify: vi.fn(),
  status: vi.fn(),
  duplicate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  pdf: vi.fn(),
  layout: vi.fn(),
  sms: vi.fn(),
  filterSearch: vi.fn(),
  filterStatus: vi.fn(),
  filterSortBy: vi.fn(),
  filterSortOrder: vi.fn(),
  listRequest: vi.fn(),
}))
let loading = false
let saving = false
let draftStatus: DraftSaveStatus = 'saved'
let uploading = false
let success = false
let draft = false
let found = true
let conflict = false
let extracting = false
let imageFailed = false
let initialStep = 1
let query = new URLSearchParams()
let originalType = 'Outward'
let defaults: Record<string, unknown> = {}
let legacyNumber = false
let errors: Record<string, { message: string }> = {}
let unmatched: Record<string, string> | null = null
let listedCheques: Array<typeof cheque> = []
let filteredCheques: Array<typeof cheque> | null = null
let listError: Error | null = null
const party = { id: 'party', name: 'Customer', contact: '+919876543210' }
const account = {
  id: 'account',
  account_name: 'Operating',
  account_number: '12345678',
  is_default: true,
  bank: { name: 'Example Bank' },
}
const cheque = {
  id: 'cheque',
  type: 'Outward',
  status: 'Issued',
  amount: 1500,
  cheque_number: '100123',
  cheque_date: '2026-10-31',
  party_id: 'party',
  account_id: 'account',
  party,
  account,
  notes: 'Invoice payment',
  image_url: 'scan-image',
  canTransition: (status: string) => status !== 'Issued',
}
listedCheques = [cheque]
filteredCheques = listedCheques

function useChequeForm(options?: {
  beforePublish?: (id: string) => Promise<void>
  onCreated?: (entity: { id: string }) => Promise<void>
}) {
  const form = useForm({
    defaultValues: {
      type: 'Outward',
      amount: 0,
      cheque_number: '',
      ...defaults,
    },
  })
  const [step, setStep] = useState(initialStep)
  return {
    form: {
      ...form,
      trigger: mocks.trigger,
      formState: { ...form.formState, errors },
    },
    step,
    nextStep: () => setStep((s) => s + 1),
    prevStep: () => setStep((s) => s - 1),
    cheque: {
      ...cheque,
      type: originalType,
      ...(legacyNumber
        ? { cheque_number: '12-345', cheque_number_legacy: true }
        : {}),
    },
    isLoading: loading,
    isSaving: saving,
    isUploading: uploading,
    isSuccess: success,
    handleImageUpload: mocks.upload,
    continueAfterSuccess: mocks.continue,
    onSubmit: async (event: React.FormEvent) => {
      event.preventDefault()
      await options?.beforePublish?.('draft')
      mocks.submit(form.getValues())
      await options?.onCreated?.({ id: 'created' })
    },
    onDelete: mocks.delete,
    draft: {
      draftId: 'draft',
      status: draftStatus,
      hasUserChanges: true,
      leaveDialogProps: {},
      setUserValue: form.setValue,
      saveDraft: mocks.save,
      navigateAfterSave: (destination: (id: string) => string) =>
        mocks.navigate(destination('draft')),
    },
  }
}
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cheque' }),
  useSearchParams: () => query,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<React.ComponentType>) => {
    const Component = lazy(async () => ({ default: await load() }))
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Component {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock('@/features/cheques/hooks/use-create-cheque', () => ({
  useCreateCheque: (
    _business: string,
    _type: string,
    options: Parameters<typeof useChequeForm>[0],
  ) => useChequeForm(options),
}))
vi.mock('@/features/cheques/hooks/use-edit-cheque', () => ({
  useEditCheque: () => useChequeForm(),
}))
vi.mock('@/features/cheques/hooks/use-cheque-detail', () => ({
  useChequeDetail: () => ({
    cheque: found ? { ...cheque, type: originalType } : null,
    isLoading: loading,
    isUpdating: saving,
    updateStatus: mocks.status,
  }),
}))
vi.mock('@/features/cheques/hooks/use-cheques', () => ({
  useCheques: () => ({
    cheques: listedCheques,
    filteredCheques,
    isLoading: loading,
    error: listError,
    search: '',
    setSearch: mocks.filterSearch,
    filter: 'All',
    setFilter: mocks.filterStatus,
    sortBy: 'date',
    setSortBy: mocks.filterSortBy,
    sortOrder: 'desc',
    setSortOrder: mocks.filterSortOrder,
    updateStatus: mocks.status,
  }),
}))
vi.mock('@/features/cheques/hooks/use-cheque-list', () => ({
  useChequeList: (
    business: string | undefined,
    native: { status?: string; from?: string; to?: string },
  ) => {
    mocks.listRequest(business, native)
    return {
      cheques: (filteredCheques ?? []).filter(
        (row) =>
          (!native.status || row.status === native.status) &&
          (!native.from || row.cheque_date >= native.from) &&
          (!native.to || row.cheque_date <= native.to),
      ),
      activeCount: listedCheques.length,
      isLoading: loading,
      error: listError,
      search: '',
      setSearch: mocks.filterSearch,
      filter: 'All',
      setFilter: mocks.filterStatus,
      sortBy: 'date',
      setSortBy: mocks.filterSortBy,
      sortOrder: 'desc',
      setSortOrder: mocks.filterSortOrder,
      updateStatus: mocks.status,
      pageIndex: 0,
      hasNextPage: false,
      nextPage: vi.fn(),
      previousPage: vi.fn(),
    }
  },
}))
vi.mock('@/features/cheques/hooks/use-cheque-actions', () => ({
  useChequeActions: () => ({ deleteCheque: mocks.delete }),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'business' } }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { currency: '$' } }),
}))
vi.mock('@/features/parties/hooks/use-party', () => ({
  useParty: () => ({ data: party }),
}))
vi.mock('@/features/parties/hooks/use-parties', () => ({
  useParties: () => ({ parties: [party] }),
}))
vi.mock('@/features/accounts/hooks/use-accounts', () => ({
  useAccounts: () => ({ accounts: [account] }),
}))
vi.mock('@/features/accounts/hooks/use-banks', () => ({
  useBanks: () => ({ data: [] }),
}))
vi.mock('@/features/cheques/hooks/use-cheque-number-conflict', () => ({
  useChequeNumberConflict: () => ({ data: conflict }),
}))
vi.mock('@/features/cheques/hooks/use-ocr-extraction', () => ({
  useOcrExtraction: () => {
    const [unmatchedEntities, setUnmatchedEntities] = useState(unmatched)
    const [createOptions, setCreateOptions] = useState({
      party: true,
      account: true,
      bank_id: '',
    })
    return {
      unmatchedEntities,
      setUnmatchedEntities,
      createOptions,
      setCreateOptions,
      isExtracting: extracting,
      isCreatingInline: false,
      extractData: mocks.extract,
      handleInlineCreate: mocks.inline,
    }
  },
}))
vi.mock('@/features/tags/hooks/use-draft-tags', () => ({
  useDraftTags: () => {
    const [tagIds, setTagIds] = useState<string[]>([])
    return { tagIds, setTagIds, flush: mocks.flush }
  },
}))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagMap: () => ({ cheque: [] }),
  useEntityTagsDraft: () => {
    const [tagIds, setTagIds] = useState<string[]>([])
    return { tagIds, setTagIds, commit: mocks.commit }
  },
}))
vi.mock('@/features/cheques/components/cheque-filter-bar', () => ({
  ChequeFilterBar: ({
    setSearch,
    setFilter,
  }: {
    setSearch: (value: string) => void
    setFilter: (value: string) => void
  }) => (
    <div>
      <button onClick={() => setSearch('100123')}>Search cheque</button>
      <button onClick={() => setFilter('Cleared')}>Filter cleared</button>
    </div>
  ),
}))
vi.mock('@/features/premium-workspace/components/native-tools', () => ({
  NativeTools: ({
    onFiltersChange,
  }: {
    onFiltersChange: (filters: Record<string, string>) => void
  }) => (
    <button onClick={() => onFiltersChange({ status: 'Bounced' })}>
      Native filter
    </button>
  ),
}))
vi.mock('@/components/ui/data-state', () => ({
  DataState: ({
    children,
    isLoading,
    isError,
    data,
    allData,
    onClearFilters,
    loadingComponent,
    emptyState,
  }: {
    children: ReactNode
    isLoading: boolean
    isError: boolean
    data: unknown[]
    allData: unknown[]
    onClearFilters: () => void
    loadingComponent: ReactNode
    emptyState: ReactNode
  }) => {
    if (isLoading) return loadingComponent
    if (isError) return <p role="alert">Could not load cheques</p>
    if (!data.length && allData.length)
      return <button onClick={onClearFilters}>Clear filters</button>
    if (!data.length) return emptyState
    return <>{children}</>
  },
}))
vi.mock('@/components/cheque-card', () => ({
  ChequeCard: ({
    cheque: row,
    onStatusUpdate,
    tags,
  }: {
    cheque: typeof cheque
    onStatusUpdate: (id: string, status: string) => void
    tags?: unknown[]
  }) => (
    <button onClick={() => onStatusUpdate(row.id, 'Cleared')}>
      {row.cheque_number} ({tags?.length ?? 0} tags)
    </button>
  ),
}))
vi.mock('@/features/tags/components/tag-selector', () => ({
  TagSelector: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['tag'])}>
      Choose tags
    </button>
  ),
}))
vi.mock('@/features/tags/components/tag-chips', () => ({
  EntityTagsSection: () => <span>Cheque tags</span>,
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({
    requireAccess: mocks.require,
    verifyAccess: mocks.verify,
    accessRequiredMessage: 'Premium required',
  }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/features/drafts', async () => {
  const { DraftSaveFab } =
    await import('@/features/drafts/components/draft-save-fab')
  return {
    DraftsLink: ({ entity }: { entity: string }) => (
      <span>{entity} drafts</span>
    ),
    DraftLeaveDialog: () => null,
    DraftSaveFab,
    useRedirectIfDraft: () => draft,
    chequeDraftService: { duplicate: mocks.duplicate },
  }
})
vi.mock('@/lib/scan-store', () => ({ ScanStore: { hasFile: () => false } }))
vi.mock('@/hooks/use-signed-media-url', () => ({
  useSignedMediaUrl: (src: string) => ({ url: src, failed: imageFailed }),
}))
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onLoad,
    onError,
  }: {
    src: string
    alt: string
    onLoad: () => void
    onError: () => void
  }) => <img src={src} alt={alt} onLoad={onLoad} onError={onError} />,
}))
vi.mock('@/components/ui/skeleton-image', () => ({
  SkeletonImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    options,
    value,
    onValueChange,
    placeholder,
    onCreateClick,
  }: {
    options: Array<{ label: string; value: string }>
    value?: string
    onValueChange: (value: string) => void
    placeholder: string
    onCreateClick?: (query: string) => void
  }) => (
    <div>
      <select
        aria-label={placeholder}
        value={value ?? ''}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {onCreateClick && (
        <button type="button" onClick={() => onCreateClick('New entity')}>
          Create {placeholder}
        </button>
      )}
    </div>
  ),
}))
vi.mock('@/components/bank-selector', () => ({
  BankSelector: ({
    value,
    onValueChange,
  }: {
    value: string
    onValueChange: (value: string) => void
  }) => (
    <button
      data-testid="ocr-bank-selector"
      onClick={() => onValueChange('bank-id')}
    >
      {value || 'Select OCR bank'}
    </button>
  ),
}))
vi.mock('@/components/speed-dial-fab', () => ({
  SpeedDialFab: ({
    editHref,
    editLabel,
    actions,
  }: {
    editHref: string
    editLabel: string
    actions: Array<{ label: string; onClick: () => void; disabled?: boolean }>
  }) => (
    <div>
      <a href={editHref}>{editLabel}</a>
      {actions.map((action) => (
        <button
          key={action.label}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/ui/delete-dialog', () => ({
  DeleteConfirmationDialog: ({
    onDelete,
    open,
  }: {
    onDelete: () => void
    open?: boolean
  }) =>
    open === undefined || open ? (
      <button type="button" onClick={onDelete}>
        Confirm deletion
      </button>
    ) : null,
}))
vi.mock('@/features/cheques/components/print-layout-editor', () => ({
  PrintLayoutEditor: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <button onClick={() => onOpenChange(false)}>Close print settings</button>
    ) : null,
}))
vi.mock('@/features/premium-workspace/services/workspace.service', () => ({
  getPrintLayout: mocks.layout,
}))
vi.mock('@/features/cheques/lib/print-cheque', () => ({
  downloadChequePrintPdf: mocks.pdf,
  getPrintLayout: () => ({ local: true }),
}))
vi.mock('@/features/cheques/lib/notify-party', () => ({
  isPartySmsEnabled: () => true,
  preparePartySms: mocks.sms,
}))

function renderPage(page: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {page}
    </NextIntlClientProvider>,
  )
}
function change(id: string, value: string) {
  fireEvent.change(document.getElementById(id)!, { target: { value } })
}
beforeEach(() => {
  vi.resetAllMocks()
  loading =
    saving =
    uploading =
    success =
    draft =
    conflict =
    extracting =
    imageFailed =
    legacyNumber =
      false
  found = true
  draftStatus = 'saved'
  originalType = 'Outward'
  initialStep = 1
  query = new URLSearchParams()
  defaults = {}
  errors = {}
  unmatched = null
  listError = null
  listedCheques = [cheque]
  filteredCheques = listedCheques
  mocks.trigger.mockResolvedValue(true)
  mocks.require.mockReturnValue(true)
  mocks.verify.mockResolvedValue(true)
  mocks.duplicate.mockResolvedValue({ id: 'copy' })
  mocks.layout.mockResolvedValue({ remote: true })
})
afterEach(cleanup)

describe('cheque draft status presentation', () => {
  it.each(
    [1, 2].flatMap((step) =>
      [false, true].flatMap((resumed) =>
        (['idle', 'saving', 'saved', 'error'] as const).map((status) => ({
          step,
          resumed,
          status,
        })),
      ),
    ),
  )(
    'keeps only the FAB on step $step with status $status (resumed=$resumed)',
    ({ step, resumed, status }) => {
      initialStep = step
      draftStatus = status
      if (resumed) query.set('draftId', 'draft')
      renderPage(<CreateChequePage />)

      for (const label of [
        messages.Drafts.saving,
        messages.Drafts.saved,
        messages.Drafts.saveFailed,
      ]) {
        expect(screen.queryByText(label)).not.toBeInTheDocument()
      }
      const button = screen.getByRole('button', { name: 'Save draft' })
      expect(button).toHaveAttribute('data-testid', 'draft-save-button')
      expect(button).toHaveClass('fixed', 'bottom-6', 'right-6')
      if (status === 'saving') expect(button).toBeDisabled()
      else expect(button).toBeEnabled()
    },
  )

  it('does not add draft status to the published cheque editor', () => {
    renderPage(<EditChequePage />)
    expect(screen.queryByText(messages.Drafts.saved)).not.toBeInTheDocument()
    expect(screen.queryByTestId('draft-save-button')).not.toBeInTheDocument()
  })
})

describe('cheque list page', () => {
  it('applies the linked date as inclusive server-side bounds and makes it clearable', () => {
    query = new URLSearchParams('date=2026-10-31&source=detail')
    const { rerender } = renderPage(<ChequesPage />)
    expect(mocks.listRequest).toHaveBeenLastCalledWith('business', {
      from: '2026-10-31',
      to: '2026-10-31',
    })
    expect(
      screen.getByRole('button', { name: '100123 (0 tags)' }),
    ).toBeVisible()
    query = new URLSearchParams('date=2026-11-01&source=detail')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequesPage />
      </NextIntlClientProvider>,
    )
    expect(mocks.listRequest).toHaveBeenLastCalledWith('business', {
      from: '2026-11-01',
      to: '2026-11-01',
    })
    expect(
      screen.queryByRole('button', { name: '100123 (0 tags)' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.clearDateFilter }),
    )
    expect(mocks.replace).toHaveBeenCalledWith('/cheques?source=detail', {
      scroll: false,
    })
    query = new URLSearchParams('source=detail')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequesPage />
      </NextIntlClientProvider>,
    )
    expect(mocks.listRequest).toHaveBeenLastCalledWith('business', {})
    expect(
      screen.getByRole('button', { name: '100123 (0 tags)' }),
    ).toBeVisible()
  })
  it('rejects invalid linked dates rather than fetching an unfiltered list', () => {
    query = new URLSearchParams('date=2026-02-30')
    renderPage(<ChequesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.Cheques.invalidDateFilter,
    )
    expect(mocks.listRequest).toHaveBeenLastCalledWith(undefined, {})
    expect(
      screen.queryByRole('button', { name: '100123 (0 tags)' }),
    ).not.toBeInTheDocument()
  })
  it('renders cheque records with tags and forwards status updates', () => {
    renderPage(<ChequesPage />)
    fireEvent.click(screen.getByRole('button', { name: '100123 (0 tags)' }))
    expect(mocks.status).toHaveBeenCalledWith('cheque', 'Cleared')
  })

  it('shows loading, failure, and no-cheques states', () => {
    loading = true
    renderPage(<ChequesPage />)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    cleanup()

    loading = false
    listError = new Error('Offline')
    renderPage(<ChequesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load cheques',
    )
    cleanup()

    listError = null
    listedCheques = []
    filteredCheques = []
    renderPage(<ChequesPage />)
    expect(screen.getByTestId('cheques-empty-state')).toBeVisible()
  })

  it('clears local and native filters after no results', () => {
    renderPage(<ChequesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Native filter' }))
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(mocks.filterSearch).toHaveBeenCalledWith('')
    expect(mocks.filterStatus).toHaveBeenCalledWith('All')
    expect(mocks.filterSortBy).not.toHaveBeenCalled()
    expect(mocks.filterSortOrder).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: '100123 (0 tags)' }),
    ).toBeVisible()
  })
})

describe('cheque creation page', () => {
  it('captures amount, entities, dates and notes, then flushes tags before and after publishing', async () => {
    renderPage(<CreateChequePage />)
    change('amount', '1500')
    change('cheque_number', '100123')
    fireEvent.click(screen.getByTestId('cheque-step1-continue'))
    expect(screen.getByTestId('cheque-step2-continue')).toBeDisabled()
    expect(
      screen.getByRole('combobox', {
        name: messages.Cheques.accountPlaceholder,
      }),
    ).toHaveValue('account')
    fireEvent.change(
      screen.getByRole('combobox', {
        name: messages.Cheques.accountPlaceholder,
      }),
      { target: { value: 'account' } },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: messages.Cheques.partyPlaceholder }),
      { target: { value: 'party' } },
    )
    fireEvent.click(screen.getByTestId('cheque-step2-continue'))
    expect(screen.getByText('$1,500')).toBeVisible()
    expect(screen.getByText('Customer')).toBeVisible()
    change('cheque_date', '2026-10-31')
    change('deposit_date', '2026-11-01')
    change('notes', 'Invoice')
    fireEvent.click(screen.getByRole('button', { name: 'Choose tags' }))
    fireEvent.click(screen.getByTestId('cheque-submit-button'))
    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1500,
          cheque_number: '100123',
          party_id: 'party',
          account_id: 'account',
          cheque_date: '2026-10-31',
          deposit_date: '2026-11-01',
          notes: 'Invoice',
        }),
      ),
    )
    expect(mocks.flush).toHaveBeenCalledWith('draft')
    expect(mocks.flush).toHaveBeenCalledWith('created')
  })
  it('gates inward tracking and allows it after access is granted', () => {
    mocks.require.mockReturnValueOnce(false)
    renderPage(<CreateChequePage />)
    fireEvent.click(screen.getByTestId('cheque-type-inward'))
    expect(screen.getByTestId('cheque-type-outward')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(screen.getByTestId('cheque-type-inward'))
    expect(screen.getByTestId('cheque-type-inward')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(mocks.require).toHaveBeenCalledWith('inward-tracking')
  })
  it('shows duplicate number and validation warnings and saves a draft', () => {
    conflict = true
    errors = {
      amount: { message: 'Amount required' },
      cheque_number: { message: 'Six digits required' },
    }
    renderPage(<CreateChequePage />)
    expect(screen.getByText('Amount required')).toBeVisible()
    expect(screen.getByText('Six digits required')).toBeVisible()
    expect(screen.getByText(messages.Drafts.duplicateNumber)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(mocks.save).toHaveBeenCalledOnce()
  })
  it('saves before opening related creation pages with a safe draft return destination', () => {
    initialStep = 2
    renderPage(<CreateChequePage />)
    fireEvent.click(
      screen.getByRole('button', {
        name: `Create ${messages.Cheques.partyPlaceholder}`,
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining('/parties/create?name=New+entity&returnTo='),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: `Create ${messages.Cheques.accountPlaceholder}`,
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining('/accounts/create?name=New+entity'),
    )
  })
  it('uploads a selected scan image, extracts returned data, and ignores empty selection', async () => {
    mocks.upload.mockResolvedValue('scan-image')
    const { container } = renderPage(<CreateChequePage />)
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [] } })
    expect(mocks.upload).not.toHaveBeenCalled()
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(file))
    await waitFor(() =>
      expect(mocks.extract).toHaveBeenCalledWith('scan-image'),
    )
  })
  it('uses one spinner instead of upload text and keeps the file picker disabled while uploading', () => {
    uploading = true
    const { container } = renderPage(<CreateChequePage />)
    const button = screen.getByRole('button', {
      name: messages.Cheques.scanUpload,
    })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button.querySelectorAll('.animate-spin')).toHaveLength(1)
    expect(button.querySelector('[data-slot="button-content"]')).toHaveClass(
      'opacity-0',
    )
    expect(container.querySelector('input[type="file"]')).toBeDisabled()
  })
  it('displays scanning feedback and lets a user remove the imported photo', () => {
    query = new URLSearchParams({ imageUrl: 'scan-image' })
    defaults = { image_url: 'scan-image' }
    extracting = true
    const { container } = renderPage(<CreateChequePage />)
    expect(screen.getByText(messages.Cheques.loading)).toBeVisible()
    expect(screen.getByAltText('Cheque')).toHaveAttribute('src', 'scan-image')
    fireEvent.click(container.querySelector('form button.absolute')!)
    expect(screen.queryByAltText('Cheque')).not.toBeInTheDocument()
  })
  it('displays unmatched OCR entities and invokes inline creation', async () => {
    unmatched = {
      payee_name: 'New payee',
      account_number: '987654',
      account_name: 'New account',
      ifsc_code: 'TEST0000001',
    }
    renderPage(<CreateChequePage />)
    expect(await screen.findByText('Create Party: New payee')).toBeVisible()
    expect(screen.getByText('Create Account: New account')).toBeVisible()
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Create Party: New payee' }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Create Account: New account' }),
    )
    expect(
      screen.getByRole('button', { name: /Create Selected/i }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Create Account: New account' }),
    )
    fireEvent.click(screen.getByTestId('ocr-bank-selector'))
    expect(screen.getByTestId('ocr-bank-selector')).toHaveTextContent('bank-id')
    fireEvent.click(screen.getByRole('button', { name: /Create Selected/i }))
    expect(mocks.inline).toHaveBeenCalledOnce()
  })
  it('renders date validation errors and disables publishing while saving', () => {
    initialStep = 3
    saving = true
    errors = {
      cheque_date: { message: 'Date required' },
      deposit_date: { message: 'Deposit date invalid' },
    }
    renderPage(<CreateChequePage />)
    expect(screen.getByText('Date required')).toBeVisible()
    expect(screen.getByText('Deposit date invalid')).toBeVisible()
    expect(screen.getByTestId('cheque-submit-button')).toBeDisabled()
  })
  it('delegates continuation after successful creation', () => {
    success = true
    renderPage(<CreateChequePage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.successCta }),
    )
    expect(mocks.continue).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('cheque-submit-button')).not.toBeInTheDocument()
  })
})

describe('cheque edit page', () => {
  it('renders the cheque number as six digit slots', () => {
    defaults = { cheque_number: '100123' }
    renderPage(<EditChequePage />)
    const input = document.getElementById('cheque_number')!
    expect(input).toHaveAttribute('maxlength', '6')
    expect(
      Array.from(document.querySelectorAll('[data-slot="digit-slot"]')).map(
        (slot) => slot.textContent,
      ),
    ).toEqual(['1', '0', '0', '1', '2', '3'])
    expect(screen.queryByTestId('legacy-cheque-number')).not.toBeInTheDocument()
  })
  it('explains how to fix a legacy cheque number', () => {
    legacyNumber = true
    renderPage(<EditChequePage />)
    expect(screen.getByTestId('legacy-cheque-number')).toHaveTextContent(
      '12-345',
    )
  })
  it('shows loading placeholders instead of editable fields', () => {
    loading = true
    renderPage(<EditChequePage />)
    expect(
      screen.queryByTestId('cheque-edit-submit-button'),
    ).not.toBeInTheDocument()
  })
  it('changes cheque data and commits tags before submission', async () => {
    const { container } = renderPage(<EditChequePage />)
    change('amount', '500')
    change('cheque_number', '999999')
    change('cheque_date', '2026-11-02')
    fireEvent.change(
      screen.getByRole('combobox', { name: messages.Cheques.partyPlaceholder }),
      { target: { value: 'party' } },
    )
    fireEvent.change(
      screen.getByRole('combobox', {
        name: messages.Cheques.accountPlaceholder,
      }),
      { target: { value: 'account' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose tags' }))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          cheque_number: '999999',
          party_id: 'party',
          account_id: 'account',
        }),
      ),
    )
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0],
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm deletion' }),
    )
    expect(mocks.delete).toHaveBeenCalledOnce()
  })
  it('blocks a newly inward cheque at selection and again at submission without entitlement', async () => {
    mocks.require.mockReturnValue(false)
    defaults = { type: 'Inward' }
    const { container } = renderPage(<EditChequePage />)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mocks.require).toHaveBeenCalledWith('inward-tracking'),
    )
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
    cleanup()
    defaults = { type: 'Outward' }
    renderPage(<EditChequePage />)
    fireEvent.click(
      screen.getByRole('tab', { name: messages.Cheques.received }),
    )
    expect(
      screen.getByRole('tab', { name: messages.Cheques.issued }),
    ).toHaveAttribute('aria-selected', 'true')
  })
  it('preserves an existing inward cheque without requiring a new entitlement', async () => {
    originalType = 'Inward'
    defaults = { type: 'Inward' }
    const { container } = renderPage(<EditChequePage />)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.require).not.toHaveBeenCalled()
  })
  it('stops entity persistence when committing tags fails', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('Offline'))
    const { container } = renderPage(<EditChequePage />)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Common.error,
        type: 'error',
      }),
    )
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('leaves invalid form handling to the hook without committing tags', async () => {
    mocks.trigger.mockResolvedValue(false)
    errors = {
      amount: { message: 'Amount invalid' },
      cheque_number: { message: 'Number invalid' },
      party_id: { message: 'Party missing' },
      account_id: { message: 'Account missing' },
      cheque_date: { message: 'Date invalid' },
    }
    const { container } = renderPage(<EditChequePage />)
    for (const message of Object.values(errors))
      expect(screen.getByText(message.message)).toBeVisible()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('uploads and removes a photo while preventing image changes during saving', () => {
    const { container } = renderPage(<EditChequePage />)
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    expect(mocks.upload).toHaveBeenCalledWith(file)
    cleanup()
    defaults = { image_url: 'scan-image' }
    renderPage(<EditChequePage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.removePhoto }),
    )
    expect(
      screen.queryByAltText(messages.Cheques.photo),
    ).not.toBeInTheDocument()
    cleanup()
    saving = true
    renderPage(<EditChequePage />)
    expect(
      screen.getByRole('button', { name: messages.Cheques.removePhoto }),
    ).toBeDisabled()
    expect(screen.getByTestId('cheque-edit-submit-button')).toBeDisabled()
  })
  it('keeps the upload action named and shows only the shared spinner while uploading', () => {
    uploading = true
    const { container } = renderPage(<EditChequePage />)
    const button = screen.getByRole('button', {
      name: messages.Cheques.scanUpload,
    })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button.querySelectorAll('.animate-spin')).toHaveLength(1)
    expect(button.querySelector('[data-slot="button-content"]')).toHaveClass(
      'opacity-0',
    )
    expect(container.querySelector('input[type="file"]')).toBeDisabled()
  })
})

describe('cheque detail page', () => {
  it.each([
    {
      type: 'Outward',
      label: messages.Cheques.recipient,
      other: messages.Cheques.payer,
    },
    {
      type: 'Inward',
      label: messages.Cheques.payer,
      other: messages.Cheques.recipient,
    },
  ])(
    'labels the party as $label for $type cheques',
    ({ type, label, other }) => {
      originalType = type
      renderPage(<ChequeDetailPage />)
      expect(screen.getByText(label)).toBeVisible()
      expect(screen.queryByText(other)).not.toBeInTheDocument()
      expect(screen.queryByText('Recipient / Payer')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Customer/ })).toHaveAttribute(
        'href',
        '/parties/party',
      )
    },
  )
  it('links party, account and cheque date to the matching detail pages and day filter', () => {
    renderPage(<ChequeDetailPage />)
    expect(screen.getByRole('link', { name: /Customer/ })).toHaveAttribute(
      'href',
      '/parties/party',
    )
    expect(screen.getByRole('link', { name: /Operating/ })).toHaveAttribute(
      'href',
      '/accounts/account',
    )
    expect(
      document.querySelector('a[href="/cheques?date=2026-10-31"]'),
    ).toBeInTheDocument()
  })
  it.each(['loading', 'draft', 'missing'])(
    'handles %s without exposing cheque actions',
    (state) => {
      loading = state === 'loading'
      draft = state === 'draft'
      found = state !== 'missing'
      renderPage(<ChequeDetailPage />)
      expect(
        screen.queryByTestId('cheque-detail-amount'),
      ).not.toBeInTheDocument()
      if (state === 'missing')
        expect(screen.getByText(messages.Cheques.notFound)).toBeVisible()
    },
  )
  it('shows cheque relations, amount, notes, scan and allowed transitions', () => {
    renderPage(<ChequeDetailPage />)
    expect(screen.getByTestId('cheque-detail-amount')).toHaveTextContent(
      '$1,500',
    )
    expect(screen.getByText('Customer')).toBeVisible()
    expect(screen.getByText('Operating')).toBeVisible()
    expect(screen.getByText('Invoice payment')).toBeVisible()
    expect(
      screen.getByRole('link', { name: messages.Cheques.editDetails }),
    ).toHaveAttribute('href', '/cheques/cheque/edit')
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.Cheques.markAs.replace('{status}', 'Cleared'),
      }),
    )
    expect(mocks.status).toHaveBeenCalledWith('Cleared')
    fireEvent.load(screen.getByAltText(messages.Cheques.scan))
    expect(screen.getByAltText(messages.Cheques.scan)).not.toHaveClass(
      'invisible',
    )
    fireEvent.error(screen.getByAltText(messages.Cheques.scan))
    expect(screen.queryByAltText(messages.Cheques.scan)).not.toBeInTheDocument()
  })
  it('duplicates into a draft and suppresses repeated clicks during navigation', async () => {
    renderPage(<ChequeDetailPage />)
    const button = screen.getByRole('button', {
      name: messages.Cheques.duplicate,
    })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/cheques/create?draftId=copy'),
    )
    expect(mocks.duplicate).toHaveBeenCalledOnce()
    fireEvent.click(button)
    expect(mocks.duplicate).toHaveBeenCalledOnce()
  })
  it('allows retrying duplication after access denial or draft failure', async () => {
    mocks.verify.mockResolvedValueOnce(false)
    mocks.duplicate.mockRejectedValueOnce(new Error('Offline'))
    renderPage(<ChequeDetailPage />)
    const button = screen.getByRole('button', {
      name: messages.Cheques.duplicate,
    })
    fireEvent.click(button)
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce())
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Cheques.duplicateFailed,
        type: 'error',
      }),
    )
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/cheques/create?draftId=copy'),
    )
  })
  it('prints using remote layout and falls back to local layout when none is stored', async () => {
    renderPage(<ChequeDetailPage />)
    const print = screen.getByRole('button', {
      name: messages.Cheques.printCheque,
    })
    fireEvent.click(print)
    await waitFor(() =>
      expect(mocks.pdf).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cheque' }),
        '$',
        { remote: true },
        expect.objectContaining({ currency: '$' }),
      ),
    )
    mocks.layout.mockResolvedValueOnce(null)
    fireEvent.click(print)
    await waitFor(() =>
      expect(mocks.pdf).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cheque' }),
        '$',
        { local: true },
        expect.objectContaining({ currency: '$' }),
      ),
    )
  })
  it('does not print without access and reports layout loading errors', async () => {
    mocks.verify.mockResolvedValueOnce(false)
    renderPage(<ChequeDetailPage />)
    const print = screen.getByRole('button', {
      name: messages.Cheques.printCheque,
    })
    fireEvent.click(print)
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce())
    expect(mocks.pdf).not.toHaveBeenCalled()
    mocks.layout.mockRejectedValueOnce(new Error('Layout unavailable'))
    fireEvent.click(print)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Layout unavailable',
          type: 'error',
        }),
      ),
    )
  })
  it('gates print settings and party notification and confirms deletion', async () => {
    mocks.require.mockReturnValueOnce(false)
    renderPage(<ChequeDetailPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.configurePrint }),
    )
    expect(
      screen.queryByRole('button', { name: 'Close print settings' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.configurePrint }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Close print settings' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.notifyParty }),
    )
    expect(mocks.sms).toHaveBeenCalledWith(
      messages.Cheques.notifyParty,
      party.contact,
      expect.objectContaining({ id: 'cheque' }),
      party,
      '$',
      'Premium required',
      expect.objectContaining({ currency: '$' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Cheques.deleteAction }),
    )
    expect(mocks.delete).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm deletion' }),
    )
    expect(mocks.delete).toHaveBeenCalledWith('cheque')
    expect(mocks.replace).toHaveBeenCalledWith('/cheques')
  })
})
