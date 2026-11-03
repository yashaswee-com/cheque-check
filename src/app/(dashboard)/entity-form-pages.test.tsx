import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch, type FieldValues } from 'react-hook-form'
import { NextIntlClientProvider } from 'next-intl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import CreateBusinessPage from './businesses/create/page'
import EditBusinessPage from './businesses/[id]/edit/page'
import CreateAccountPage from './accounts/create/page'
import EditAccountPage from './accounts/[id]/edit/page'
import CreatePartyPage from './parties/create/page'
import EditPartyPage from './parties/[id]/edit/page'
import type { DraftSaveStatus } from '@/features/drafts/hooks/use-draft-autosave'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
  flush: vi.fn(),
  saveDraft: vi.fn(),
  exit: vi.fn(),
  continue: vi.fn(),
  toast: vi.fn(),
  attach: vi.fn(),
  upload: vi.fn(),
  validateImage: vi.fn(),
  requireAccess: vi.fn(),
  trigger: vi.fn(),
}))
let query = new URLSearchParams()
let loading = false
let saving = false
let draftStatus: DraftSaveStatus = 'saved'
let success = false
let defaults: FieldValues = {}
let errors: Record<string, { message: string }> = {}
let values: FieldValues = {}
let initialStep = 1
let deferDynamic = false
let profileCurrency: string | null = '$'
let emptyConfirmName = false
let parties: Array<{ id: string; name: string; contact: string }> = []

function useEntityForm(options?: {
  onCreated?: (entity: { id: string }) => Promise<void>
}) {
  const form = useForm({
    defaultValues: { name: '', is_default: false, ...defaults },
  })
  const [step, setStep] = useState(initialStep)
  const [tagIds, setTagIds] = useState<string[]>([])
  const watchedValues = useWatch({ control: form.control })
  useEffect(() => {
    values = watchedValues
  }, [watchedValues])
  return {
    form: {
      ...form,
      trigger: mocks.trigger,
      formState: { ...form.formState, errors },
    },
    step,
    nextStep: () => setStep((current) => current + 1),
    prevStep: () => setStep((current) => current - 1),
    isLoading: loading,
    isSaving: saving,
    isSuccess: success,
    business: {
      id: 'entity',
      name: emptyConfirmName ? '' : 'Original business',
    },
    account: {
      id: 'entity',
      account_name: emptyConfirmName ? '' : 'Original account',
    },
    party: { id: 'entity', name: emptyConfirmName ? '' : 'Original party' },
    continueAfterSuccess: mocks.continue,
    onDelete: mocks.delete,
    onSubmit: async (event: React.FormEvent) => {
      event.preventDefault()
      mocks.submit(form.getValues())
      await options?.onCreated?.({ id: 'created' })
    },
    draft: {
      draftId: 'draft',
      status: draftStatus,
      hasUserChanges: true,
      setUserValue: form.setValue,
      saveDraft: mocks.saveDraft,
      saveDraftAndExit: mocks.exit,
      leaveDialogProps: {},
    },
    tagIds,
    setTagIds,
  }
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'entity' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => query,
}))
vi.mock('next/dynamic', () => ({
  default: (
    load: () => Promise<React.ComponentType>,
    options?: { loading?: () => ReactNode },
  ) => {
    const Component = lazy(async () => ({ default: await load() }))
    return function Dynamic(props: Record<string, unknown>) {
      if (deferDynamic) return <>{options?.loading?.()}</>
      return (
        <Suspense
          fallback={options?.loading?.() ?? <span>Loading widget</span>}
        >
          <Component {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'business' } }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: profileCurrency ? { currency: profileCurrency } : null,
  }),
}))
vi.mock('@/features/businesses/hooks/use-create-business', () => ({
  useCreateBusiness: () => useEntityForm(),
}))
vi.mock('@/features/businesses/hooks/use-edit-business', () => ({
  useEditBusiness: () => useEntityForm(),
}))
vi.mock('@/features/accounts/hooks/use-create-account', () => ({
  useCreateAccount: (
    _id: string,
    options: Parameters<typeof useEntityForm>[0],
  ) => useEntityForm(options),
}))
vi.mock('@/features/accounts/hooks/use-edit-account', () => ({
  useEditAccount: () => useEntityForm(),
}))
vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: { getAll: async () => [] },
}))
vi.mock('@/features/parties/hooks/use-create-party', () => ({
  useCreateParty: (_id: string, options: Parameters<typeof useEntityForm>[0]) =>
    useEntityForm(options),
}))
vi.mock('@/features/parties/hooks/use-edit-party', () => ({
  useEditParty: () => useEntityForm(),
}))
vi.mock('@/features/parties/hooks/use-parties', () => ({
  useParties: () => ({ parties }),
}))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagsDraft: () => {
    const [tagIds, setTagIds] = useState<string[]>([])
    return { tagIds, setTagIds, commit: mocks.commit }
  },
}))
vi.mock('@/features/parties/hooks/use-party-draft-tags', () => ({
  usePartyDraftTags: () => {
    const [tagIds, setTagIds] = useState<string[]>([])
    return { tagIds, setTagIds, flush: mocks.flush }
  },
}))
vi.mock('@/features/tags/components/tag-selector', () => ({
  TagSelector: ({
    value,
    onChange,
  }: {
    value: string[]
    onChange: (ids: string[]) => void
  }) => (
    <button type="button" onClick={() => onChange(['tag-one', 'tag-two'])}>
      Choose tags ({value.length})
    </button>
  ),
}))
vi.mock('@/features/tags/services/tag.service', () => ({
  tagService: { attach: mocks.attach },
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ requireAccess: mocks.requireAccess }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/services/storage.service', () => ({
  storageService: { uploadAvatar: mocks.upload },
}))
vi.mock('@/lib/storage', () => ({ validateImageFile: mocks.validateImage }))
vi.mock('@/components/ui/phone-input', () => ({
  useDefaultPhoneCountry: () => 'IN',
  PhoneInput: ({
    value,
    onChange,
    ...props
  }: {
    value?: string
    onChange: (value: string) => void
    id?: string
  }) => (
    <input
      {...props}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))
vi.mock('@/components/bank-selector', () => ({
  BankSelector: ({
    value,
    onValueChange,
  }: {
    value?: string
    onValueChange: (id: string) => void
  }) => (
    <select
      aria-label="Bank"
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Select bank</option>
      <option value="bank">Example Bank</option>
    </select>
  ),
}))
vi.mock('@/components/ui/editable-avatar', () => ({
  EditableAvatar: ({
    imageUrl,
    onUpload,
    onDelete,
  }: {
    imageUrl?: string
    onUpload: (url: string) => void
    onDelete: () => void
  }) => (
    <div>
      <span>{imageUrl ?? 'No avatar'}</span>
      <button type="button" onClick={() => onUpload('avatar-url')}>
        Upload avatar
      </button>
      <button type="button" onClick={onDelete}>
        Remove avatar
      </button>
    </div>
  ),
}))
vi.mock('@/components/ui/delete-dialog', () => ({
  DeleteConfirmationDialog: ({
    onDelete,
    confirmName,
  }: {
    onDelete: () => void
    confirmName: string
  }) => (
    <button type="button" onClick={onDelete}>
      Confirm delete {confirmName}
    </button>
  ),
}))
vi.mock('@/features/drafts', async () => {
  const { DraftSaveFab } =
    await import('@/features/drafts/components/draft-save-fab')
  return {
    DraftLeaveDialog: ({ onSave }: { onSave?: () => void }) => (
      <button type="button" onClick={onSave}>
        Save and leave
      </button>
    ),
    DraftSaveFab,
  }
})

function renderPage(page: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="UTC"
        onError={() => {}}
      >
        {page}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
function change(id: string, value: string) {
  fireEvent.change(document.getElementById(id)!, { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  loading = saving = success = false
  draftStatus = 'saved'
  initialStep = 1
  deferDynamic = false
  profileCurrency = '$'
  emptyConfirmName = false
  query = new URLSearchParams()
  defaults = {}
  errors = {}
  parties = []
  mocks.trigger.mockResolvedValue(true)
  mocks.commit.mockResolvedValue(undefined)
  mocks.flush.mockResolvedValue(undefined)
  mocks.saveDraft.mockResolvedValue(undefined)
  mocks.attach.mockResolvedValue(undefined)
  mocks.upload.mockResolvedValue('uploaded-avatar')
  mocks.validateImage.mockResolvedValue(undefined)
  mocks.requireAccess.mockReturnValue(true)
  Object.defineProperty(navigator, 'contacts', {
    configurable: true,
    value: undefined,
  })
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each([
  { entity: 'account', Page: CreateAccountPage, steps: [1, 2, 3] },
  { entity: 'party', Page: CreatePartyPage, steps: [1, 2, 3] },
])('$entity draft status presentation', ({ Page, steps }) => {
  it.each(
    steps.flatMap((step) =>
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
      renderPage(<Page />)

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
})

it.each([
  { flow: 'business creation', Page: CreateBusinessPage },
  { flow: 'business editor', Page: EditBusinessPage },
  { flow: 'account editor', Page: EditAccountPage },
  { flow: 'party editor', Page: EditPartyPage },
])('does not add draft status to the $flow', ({ Page }) => {
  renderPage(<Page />)
  expect(screen.queryByText(messages.Drafts.saved)).not.toBeInTheDocument()
  expect(screen.queryByTestId('draft-save-button')).not.toBeInTheDocument()
})

describe('business creation page', () => {
  it('orders the business logo, name, and theme color fields', () => {
    renderPage(<CreateBusinessPage />)

    const fields = screen.getByTestId('business-step1-fields')
    expect(
      Array.from(fields.children, (field) => field.getAttribute('data-testid')),
    ).toEqual([
      'business-logo-field',
      'business-name-field',
      'business-theme-color-field',
    ])
  })

  it('gates each step, keeps entered contact details, and submits the displayed summary', async () => {
    renderPage(<CreateBusinessPage />)
    expect(screen.getByTestId('business-step1-continue')).toBeDisabled()
    change('name', 'Acme Trading')
    fireEvent.click(
      document.querySelector('button[style*="background-color"]')!,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Upload avatar' }))
    expect(values.logo_url).toBe('avatar-url')
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }))
    expect(values.logo_url).toBeNull()
    fireEvent.click(screen.getByTestId('business-step1-continue'))
    expect(screen.getByTestId('business-step2-continue')).toBeDisabled()
    change('email', 'accounts@example.test')
    change('phone', '+919876543210')
    fireEvent.click(screen.getByTestId('business-step2-continue'))
    expect(screen.getByText('Acme Trading')).toBeVisible()
    expect(screen.getByText('accounts@example.test')).toBeVisible()
    change('address', 'Warehouse Road')
    fireEvent.click(screen.getByTestId('business-submit-button'))
    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Trading',
          email: 'accounts@example.test',
          phone: '+919876543210',
          address: 'Warehouse Road',
          color: expect.any(String),
        }),
      ),
    )
  })
  it('displays field errors and prevents duplicate final submissions while saving', () => {
    errors = {
      name: { message: 'Business name required' },
      email: { message: 'Business email invalid' },
      phone: { message: 'Business phone invalid' },
    }
    const view = renderPage(<CreateBusinessPage />)
    expect(screen.getByText('Business name required')).toBeVisible()
    cleanup()
    saving = true
    initialStep = 3
    view.unmount()
    renderPage(<CreateBusinessPage />)
    expect(screen.getByTestId('business-submit-button')).toBeDisabled()
  })
  it('displays contact-field validation errors on the contact step', () => {
    initialStep = 2
    errors = {
      email: { message: 'Business email invalid' },
      phone: { message: 'Business phone invalid' },
    }
    renderPage(<CreateBusinessPage />)
    expect(screen.getByText('Business email invalid')).toBeVisible()
    expect(screen.getByText('Business phone invalid')).toBeVisible()
  })
  it('allows returning from contact step and continuing after success', () => {
    initialStep = 2
    defaults = { name: 'Saved name' }
    const view = renderPage(<CreateBusinessPage />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(document.getElementById('name')).toHaveValue('Saved name')
    success = true
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreateBusinessPage />
      </NextIntlClientProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Businesses.successCta }),
    )
    expect(mocks.continue).toHaveBeenCalledOnce()
  })
})

describe('account creation page', () => {
  it('uses the default currency when profile data is unavailable', () => {
    profileCurrency = null
    initialStep = 2
    renderPage(<CreateAccountPage />)
    expect(screen.getByText('₹')).toBeVisible()
  })

  it('uses the bank selector loading placeholder while the dynamic widget loads', () => {
    deferDynamic = true
    initialStep = 2
    renderPage(<CreateAccountPage />)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    deferDynamic = false
  })

  it('requires account holder first, then bank and number, captures balance/default status, and attaches selected tags', async () => {
    renderPage(<CreateAccountPage />)
    fireEvent.click(
      document.querySelector('button[style*="background-color"]')!,
    )
    expect(values.color).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Bank' })).toBeNull()
    expect(screen.getByTestId('account-step1-continue')).toBeDisabled()
    change('account_name', 'Operating')
    fireEvent.click(screen.getByTestId('account-step1-continue'))
    expect(screen.getByTestId('account-step2-continue')).toBeDisabled()
    fireEvent.change(await screen.findByRole('combobox', { name: 'Bank' }), {
      target: { value: 'bank' },
    })
    change('account_number', '12345678')
    change('opening_balance', '1250.50')
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('account-step2-continue'))
    change('ifsc_code', 'TEST0000001')
    fireEvent.click(screen.getByRole('button', { name: 'Choose tags (0)' }))
    fireEvent.click(screen.getByTestId('account-submit-button'))
    await waitFor(() => expect(mocks.attach).toHaveBeenCalledTimes(2))
    expect(mocks.attach).toHaveBeenCalledWith({
      tag_id: 'tag-one',
      entity_type: 'account',
      entity_id: 'created',
    })
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        bank_id: 'bank',
        account_name: 'Operating',
        account_number: '12345678',
        opening_balance: 1250.5,
        is_default: true,
        ifsc_code: 'TEST0000001',
      }),
    )
  })
  it('prefills OCR values only for new forms and persists draft on request', async () => {
    query = new URLSearchParams({
      name: 'Scanned account',
      number: '987654',
      ifsc: 'BANK0000001',
      auto: 'true',
    })
    renderPage(<CreateAccountPage />)
    expect(document.getElementById('account_name')).toHaveValue(
      'Scanned account',
    )
    expect(values.account_number).toBe('987654')
    expect(values.ifsc_code).toBe('BANK0000001')
    expect(values.notes).toBe('Automatically Generated from Cheque Scan')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(mocks.saveDraft).toHaveBeenCalledOnce()
    cleanup()
    query.set('draftId', 'restored')
    defaults = { account_name: 'Restored account' }
    renderPage(<CreateAccountPage />)
    expect(document.getElementById('account_name')).toHaveValue(
      'Restored account',
    )
    expect(
      screen.queryByText('Automatically Generated from Cheque Scan'),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(values.notes).toBeUndefined())
  })
  it('renders bank/account/balance errors and disables submission while saving', async () => {
    errors = {
      bank_id: { message: 'Select a bank first' },
      account_name: { message: 'Account name invalid' },
      account_number: { message: 'Number invalid' },
      opening_balance: { message: 'Balance invalid' },
    }
    renderPage(<CreateAccountPage />)
    expect(screen.getByText('Account name invalid')).toBeVisible()
    expect(screen.queryByText('Select a bank first')).toBeNull()
    cleanup()
    initialStep = 2
    renderPage(<CreateAccountPage />)
    for (const message of [
      'Select a bank first',
      'Number invalid',
      'Balance invalid',
    ])
      expect(screen.getByText(message)).toBeVisible()
    cleanup()
    initialStep = 3
    saving = true
    renderPage(<CreateAccountPage />)
    expect(screen.getByTestId('account-submit-button')).toBeDisabled()
  })
  it('renders success instead of the form and delegates continuation', () => {
    success = true
    renderPage(<CreateAccountPage />)
    expect(
      screen.queryByTestId('account-step1-continue'),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Accounts.successCta }),
    )
    expect(mocks.continue).toHaveBeenCalledOnce()
  })
})

describe.each([
  {
    name: 'business',
    Component: EditBusinessPage,
    avatar: 'logo_url',
    submitLabel: messages.Businesses.updateBusiness,
  },
  {
    name: 'account',
    Component: EditAccountPage,
    avatar: null,
    submitLabel: messages.Accounts.updateAccount,
  },
  {
    name: 'party',
    Component: EditPartyPage,
    avatar: 'avatar_url',
    submitLabel: messages.Parties.updateParty,
  },
])('$name edit page', ({ name, Component, avatar }) => {
  it('uses the dynamic control loading fallback', () => {
    deferDynamic = true
    renderPage(<Component />)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    deferDynamic = false
  })

  it('shows loading placeholders instead of editable controls', () => {
    loading = true
    const { container } = renderPage(<Component />)
    expect(container.querySelector('form')).toBeNull()
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument()
  })
  it('renders validation errors and falls back for an empty confirmation name', async () => {
    errors = {
      bank_id: { message: 'Bank required' },
      account_number: { message: 'Account number required' },
      opening_balance: { message: 'Balance required' },
      email: { message: 'Email invalid' },
      phone: { message: 'Phone invalid' },
      contact: { message: 'Contact required' },
    }
    emptyConfirmName = true
    if (name === 'account') profileCurrency = null
    renderPage(<Component />)
    if (name === 'account') expect(screen.getByText('₹')).toBeVisible()
    const expectedErrors =
      name === 'account'
        ? ['Bank required', 'Account number required', 'Balance required']
        : name === 'business'
          ? ['Email invalid', 'Phone invalid']
          : ['Contact required']
    for (const message of expectedErrors)
      expect(screen.getByText(message)).toBeVisible()
    expect(
      await screen.findByRole('button', {
        name: name === 'account' ? /Confirm delete Account/ : 'Confirm delete',
      }),
    ).toBeVisible()
  })
  it('edits identity, color and tags before persisting, and invokes deletion', async () => {
    defaults = {
      name: 'Original',
      account_name: 'Original',
      account_number: '1234',
      color: '#007AFF',
    }
    const { container } = renderPage(<Component />)
    change(avatar === null ? 'account_name' : 'name', 'Updated')
    fireEvent.click(screen.getByRole('button', { name: '#FF3B30' }))
    expect(values.color).toBe('#FF3B30')
    if (avatar) {
      fireEvent.click(screen.getByRole('button', { name: 'Upload avatar' }))
      expect(values[avatar]).toBe('avatar-url')
      fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }))
      expect(values[avatar]).toBeNull()
      change(avatar === 'logo_url' ? 'phone' : 'contact', '+919876543210')
    } else {
      fireEvent.change(await screen.findByRole('combobox', { name: 'Bank' }), {
        target: { value: 'bank' },
      })
      fireEvent.click(screen.getByRole('checkbox'))
      expect(values.is_default).toBe(true)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Choose tags (0)' }))
    expect(
      screen.getByRole('button', { name: 'Choose tags (2)' }),
    ).toBeVisible()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0],
    )
    fireEvent.click(
      await screen.findByRole('button', { name: /Confirm delete/ }),
    )
    expect(mocks.delete).toHaveBeenCalledOnce()
  })
  it('does not save the entity when committing tags fails', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('Tag persistence failed'))
    const { container } = renderPage(<Component />)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Common.error,
        type: 'error',
      }),
    )
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('lets the form hook handle invalid fields without committing tags', async () => {
    mocks.trigger.mockResolvedValue(false)
    errors = {
      name: { message: 'Required identity' },
      account_name: { message: 'Required identity' },
    }
    const { container } = renderPage(<Component />)
    expect(screen.getByText('Required identity')).toBeVisible()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('disables the save control while an update is pending', () => {
    saving = true
    const { container } = renderPage(<Component />)
    expect(container.querySelector('button[type="submit"]')).toBeDisabled()
  })
  it('shows the spinner throughout tag persistence and prevents repeated form submissions', async () => {
    const task = Promise.withResolvers<void>()
    mocks.commit.mockReturnValueOnce(task.promise)
    const { container } = renderPage(<Component />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledOnce())
    const button = container.querySelector('button[type="submit"]')!
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelectorAll('.animate-spin')).toHaveLength(1)
    fireEvent.submit(form)
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.submit).not.toHaveBeenCalled()
    task.resolve()
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    await waitFor(() => expect(button).toBeEnabled())
  })
})

describe('party creation page', () => {
  it('places import beside the name input and separates required and optional pages', async () => {
    const { container } = renderPage(<CreatePartyPage />)
    const nameField = screen.getByTestId('party-name-field')
    const input = screen.getByPlaceholderText(messages.Parties.enterFullName)
    const importButton = screen.getByRole('button', {
      name: messages.Parties.importFromContacts,
    })
    expect(input.parentElement?.parentElement).toBe(nameField)
    expect(importButton.parentElement).toBe(nameField)
    expect(input.parentElement?.nextElementSibling).toBe(importButton)
    expect(importButton).not.toHaveClass('absolute')
    expect(
      importButton.querySelector('[data-slot="premium-mark"]'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(messages.Parties.contactImportHelp),
    ).not.toBeInTheDocument()
    expect(document.getElementById('contact')).toBeVisible()
    expect(document.getElementById('email')).toBeNull()
    expect(document.getElementById('notes')).toBeNull()
    expect(screen.queryByTestId('party-submit-button')).not.toBeInTheDocument()
    change('name', 'New Customer')
    change('contact', '+919876543210')
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(document.getElementById('email')).toBeVisible())
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(document.getElementById('name')).toBeNull()
    expect(document.getElementById('address')).toBeVisible()
    expect(document.getElementById('notes')).toBeNull()
    fireEvent.click(screen.getByTestId('party-step2-skip'))
    expect(document.getElementById('notes')).toBeVisible()
    expect(document.getElementById('email')).toBeNull()
    expect(screen.getByText('New Customer')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Parties.previousStep }),
    )
    expect(document.getElementById('email')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Parties.previousStep }),
    )
    expect(document.getElementById('name')).toHaveValue('New Customer')
    expect(document.getElementById('contact')).toHaveValue('+919876543210')
    fireEvent.click(screen.getByTestId('party-step1-continue'))
    fireEvent.click(screen.getByTestId('party-step2-skip'))
    fireEvent.click(screen.getByTestId('party-submit-button'))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
  })

  it('offers the party theme color with the optional details, not the final step', () => {
    initialStep = 2
    renderPage(<CreatePartyPage />)
    const theme = screen.getByTestId('party-theme-color')
    expect(theme).toHaveTextContent(messages.Common.themeColor)
    expect(document.getElementById('email')).toBeVisible()
    const swatch = within(theme).getAllByRole('button')[1]
    fireEvent.click(swatch)
    expect(swatch).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('party-step2-skip'))
    expect(screen.queryByTestId('party-theme-color')).not.toBeInTheDocument()
    expect(document.getElementById('notes')).toBeVisible()
  })

  it('displays optional email validation errors on the second page', () => {
    initialStep = 2
    errors = { email: { message: 'Invalid email' } }
    renderPage(<CreatePartyPage />)
    expect(screen.getByText('Invalid email')).toBeVisible()
  })

  it('shows party name and contact validation errors', () => {
    errors = {
      name: { message: 'Party name required' },
      contact: { message: 'Contact required' },
    }
    renderPage(<CreatePartyPage />)
    expect(screen.getByText('Party name required')).toBeVisible()
    expect(screen.getByText('Contact required')).toBeVisible()
  })

  it('prefills a scanned name, warns about duplicates, and flushes tags before creating', async () => {
    query = new URLSearchParams({ name: 'Existing Customer' })
    parties = [
      { id: 'existing', name: 'Existing Customer', contact: '+919876543210' },
    ]
    const { container } = renderPage(<CreatePartyPage />)
    expect(document.getElementById('name')).toHaveValue('Existing Customer')
    expect(screen.getByRole('status')).toHaveTextContent('Existing Customer')
    change('contact', '+919876543210')
    fireEvent.click(screen.getByTestId('party-step1-continue'))
    fireEvent.click(
      screen.getByRole('button', { name: '#FF9500', hidden: true }),
    )
    expect(values.color).toBe('#FF9500')
    fireEvent.click(screen.getByTestId('party-step2-skip'))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(mocks.flush).toHaveBeenCalledWith('draft')
    expect(mocks.flush).toHaveBeenCalledWith('created')
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0],
    )
  })
  it('preserves restored name and blocks creation when draft tag flushing fails', async () => {
    query = new URLSearchParams({ name: 'Scan name', draftId: 'restored' })
    defaults = { name: 'Restored name' }
    mocks.flush.mockRejectedValueOnce(new Error('Offline'))
    const { container } = renderPage(<CreatePartyPage />)
    expect(document.getElementById('name')).toHaveValue('Restored name')
    fireEvent.click(screen.getByTestId('party-step1-continue'))
    fireEvent.click(screen.getByTestId('party-step2-skip'))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      ),
    )
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('gates contact import and reports unsupported browsers', async () => {
    mocks.requireAccess.mockReturnValueOnce(false)
    renderPage(<CreatePartyPage />)
    const importButton = screen.getByRole('button', {
      name: messages.Parties.importFromContacts,
    })
    fireEvent.click(importButton)
    expect(mocks.requireAccess).toHaveBeenCalledWith('contact-import')
    expect(mocks.toast).not.toHaveBeenCalled()
    await waitFor(() => expect(importButton).toBeEnabled())
    fireEvent.click(importButton)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        description: messages.Parties.contactPickerUnavailable,
      }),
    )
  })
  it('imports and normalizes a selected contact', async () => {
    const select = vi
      .fn()
      .mockResolvedValue([{ name: ['  New Customer  '], tel: ['9876543210'] }])
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: { select },
    })
    renderPage(<CreatePartyPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Parties.importFromContacts }),
    )
    await waitFor(() =>
      expect(document.getElementById('name')).toHaveValue('New Customer'),
    )
    expect(document.getElementById('contact')).toHaveValue('+919876543210')
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: false })
  })
  it('preserves empty contact fields and falls back when a phone is not parseable', async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce([{ name: [], tel: [] }])
      .mockResolvedValueOnce([{ name: ['Contact'], tel: ['not a phone'] }])
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: { select },
    })
    renderPage(<CreatePartyPage />)
    const importButton = screen.getByRole('button', {
      name: messages.Parties.importFromContacts,
    })
    fireEvent.click(importButton)
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1))
    expect(document.getElementById('name')).toHaveValue('')
    expect(document.getElementById('contact')).toHaveValue('')
    fireEvent.click(importButton)
    await waitFor(() =>
      expect(document.getElementById('contact')).toHaveValue('not a phone'),
    )
  })
  it.each([
    { error: new DOMException('Cancelled', 'AbortError'), notify: false },
    { error: new Error('Permission denied'), notify: true },
  ])(
    'handles contact-picker rejection ($notify)',
    async ({ error, notify }) => {
      const select = vi.fn().mockRejectedValue(error)
      Object.defineProperty(navigator, 'contacts', {
        configurable: true,
        value: { select },
      })
      renderPage(<CreatePartyPage />)
      fireEvent.click(
        screen.getByRole('button', {
          name: messages.Parties.importFromContacts,
        }),
      )
      await waitFor(() => expect(select).toHaveBeenCalledOnce())
      if (notify)
        await waitFor(() =>
          expect(mocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({
              description: messages.Parties.contactImportFailed,
              type: 'error',
            }),
          ),
        )
      else expect(mocks.toast).not.toHaveBeenCalled()
    },
  )
  it('validates then uploads an avatar and replaces its temporary preview', async () => {
    initialStep = 2
    let finishUpload!: (url: string) => void
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishUpload = resolve
        }),
    )
    const { container } = renderPage(<CreatePartyPage />)
    const file = new File(['photo'], 'photo.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'blob:preview',
      ),
    )
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          new File(['replacement'], 'replacement.png', { type: 'image/png' }),
        ],
      },
    })
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview'),
    )
    finishUpload('uploaded-avatar')
    await waitFor(() => expect(values.avatar_url).toBe('uploaded-avatar'))
    expect(mocks.validateImage).toHaveBeenCalledWith(file, 5 * 1024 * 1024)
    expect(mocks.upload).toHaveBeenCalledWith(file)
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'uploaded-avatar',
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
  it('opens the optional avatar picker and ignores an empty file selection', () => {
    initialStep = 2
    const { container } = renderPage(<CreatePartyPage />)
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const click = vi.spyOn(input, 'click')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Parties.addPhoto }),
    )
    expect(click).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { files: [] } })
    expect(mocks.validateImage).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it.each(['validation', 'upload'])(
    'reports avatar %s failures without assigning an image',
    async (stage) => {
      initialStep = 2
      if (stage === 'validation')
        mocks.validateImage.mockRejectedValueOnce(new Error('Invalid image'))
      else mocks.upload.mockRejectedValueOnce(new Error('Upload failed'))
      const { container } = renderPage(<CreatePartyPage />)
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
      })
      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            description:
              stage === 'validation' ? 'Invalid image' : 'Upload failed',
            type: 'error',
          }),
        ),
      )
      expect(values.avatar_url).toBeUndefined()
      if (stage === 'validation') expect(mocks.upload).not.toHaveBeenCalled()
    },
  )
  it('saves draft tags before leaving, but does not exit when tags cannot be saved', async () => {
    renderPage(<CreatePartyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await waitFor(() => expect(mocks.exit).toHaveBeenCalledOnce())
    expect(mocks.saveDraft).toHaveBeenCalledOnce()
    mocks.exit.mockClear()
    mocks.flush.mockRejectedValueOnce(new Error('Offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      ),
    )
    expect(mocks.exit).not.toHaveBeenCalled()
  })
  it('saves the party draft and flushes its tags from the save shortcut', async () => {
    renderPage(<CreatePartyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledOnce()
      expect(mocks.flush).toHaveBeenCalledWith(null)
    })
  })
  it('shows success and continues without leaving a form visible', () => {
    success = true
    renderPage(<CreatePartyPage />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Parties.successCta }),
    )
    expect(mocks.continue).toHaveBeenCalledOnce()
    expect(document.querySelector('form')).toBeNull()
  })
})
