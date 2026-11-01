import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BankSelector } from './bank-selector'

const state = vi.hoisted(() => ({
  banks: [
    { id: 'bank1', name: 'Example Bank', logo_url: null, owner_id: null },
  ] as {
    id: string
    name: string
    logo_url: null
    owner_id: string | null
  }[],
  hasData: true,
  isPending: false,
  error: null as Error | null,
  refetch: vi.fn(),
  create: { isPending: false, mutateAsync: vi.fn() },
  remove: { mutateAsync: vi.fn() },
  toast: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'add' ? 'Add New Bank' : key,
}))
vi.mock('../hooks/use-banks', () => ({
  useBanks: () => ({
    data: state.hasData ? state.banks : undefined,
    isPending: state.isPending,
    error: state.error,
    refetch: state.refetch,
  }),
  useBankMutations: () => state,
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: state.toast } }))
const scrollDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)
beforeEach(() => {
  vi.clearAllMocks()
  state.banks = [
    { id: 'bank1', name: 'Example Bank', logo_url: null, owner_id: null },
  ]
  state.hasData = true
  state.isPending = state.create.isPending = false
  state.error = null
  state.create.mutateAsync.mockResolvedValue({ id: 'new-bank' })
  state.remove.mutateAsync.mockResolvedValue(undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  if (scrollDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      scrollDescriptor,
    )
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount(value?: string, className?: string) {
  const onValueChange = vi.fn()
  render(
    <BankSelector
      value={value}
      onValueChange={onValueChange}
      className={className}
    />,
  )
  return onValueChange
}
function open() {
  fireEvent.click(screen.getByTestId('bank-selector-trigger'))
}
async function addForm() {
  open()
  fireEvent.click(await screen.findByRole('button', { name: 'Add New Bank' }))
  return screen.findByRole('textbox', { name: 'name' })
}
function submit() {
  const input = screen.getByRole('textbox', { name: 'name' })
  const form = input.closest('form')
  if (!form) throw new Error('Bank creation form missing')
  fireEvent.submit(form)
}

describe('BankSelector', () => {
  it('renders only one page of a 5,000-bank catalog and searches beyond it', async () => {
    state.banks = Array.from({ length: 5000 }, (_, index) => ({
      id: `bank${index}`,
      name: `Bank ${index}`,
      logo_url: null,
      owner_id: null,
    }))
    const change = mount('bank4999')
    expect(screen.getByTestId('bank-selector-trigger')).toHaveTextContent(
      'Bank 4999',
    )
    open()
    expect(await screen.findAllByTestId('bank-option')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: 'nextPage' }))
    expect(screen.getAllByTestId('bank-option')).toHaveLength(50)
    expect(screen.getAllByTestId('bank-option')[0]).toHaveTextContent('Bank 50')
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Bank 4999' },
    })
    const option = (await screen.findAllByTestId('bank-option'))[0]
    expect(option).toHaveTextContent('Bank 4999')
    fireEvent.click(option)
    expect(change).toHaveBeenCalledWith('bank4999')
  })
  it('right-aligns the custom bank delete action with an icon and requires confirmation', async () => {
    state.banks[0].owner_id = 'user'
    const change = mount('bank1')
    const removeButton = screen.getByRole('button', { name: 'remove' })
    expect(removeButton.parentElement).toHaveClass('flex', 'justify-end')
    expect(removeButton.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(removeButton)
    const dialog = await screen.findByRole('dialog')
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Example Bank' } })
    const confirm =
      dialog.querySelector('[data-testid="delete-confirm-button"]') ??
      screen.getAllByRole('button', { name: /delete/i }).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(state.remove.mutateAsync).toHaveBeenCalledWith('bank1'),
    )
    expect(change).toHaveBeenCalledWith('')
  })

  it('opens a bottom sheet with a plus-icon add action and closes without saving', async () => {
    mount()
    open()
    const addButton = await screen.findByRole('button', {
      name: 'Add New Bank',
    })
    expect(addButton.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(addButton)
    const sheet = await screen.findByRole('dialog', { name: 'create' })
    expect(sheet).toHaveAttribute('data-slot', 'sheet-content')
    expect(sheet).toHaveClass('bottom-0')
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(state.create.mutateAsync).not.toHaveBeenCalled()
  })

  it('quotes an unmatched search and prefills the custom bank sheet', async () => {
    const change = mount()
    open()
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '  Zzz Local Credit Bank  ' },
    })
    expect(await screen.findByText('noBankFound')).toBeInTheDocument()
    const addButton = screen.getByRole('button', {
      name: 'Add New Bank "Zzz Local Credit Bank"',
    })
    fireEvent.click(addButton)
    expect(await screen.findByRole('textbox', { name: 'name' })).toHaveValue(
      'Zzz Local Credit Bank',
    )
    submit()
    await waitFor(() => expect(change).toHaveBeenCalledWith('new-bank'))
    expect(state.create.mutateAsync).toHaveBeenCalledWith({
      name: 'Zzz Local Credit Bank',
      abbreviation: null,
      bank_type: null,
      country_code: 'IN',
    })
  })

  it('does not reuse an abandoned name when adding without a search', async () => {
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Abandoned Bank' } })
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(await addForm()).toHaveValue('')
  })

  it('does not offer deletion for a shared catalog bank', () => {
    mount('bank1')
    expect(
      screen.queryByRole('button', { name: 'remove' }),
    ).not.toBeInTheDocument()
  })
  it('shows the selected bank and selects another catalog entry', async () => {
    const onValueChange = mount('bank1')
    expect(screen.getByTestId('bank-selector-trigger')).toHaveTextContent(
      'Example Bank',
    )
    open()
    fireEvent.click(await screen.findByTestId('bank-option'))
    expect(onValueChange).toHaveBeenCalledWith('bank1')
    await waitFor(() =>
      expect(screen.getByTestId('bank-selector-trigger')).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    )
  })

  it('shows loading and blocks custom additions until the catalog loads', async () => {
    state.isPending = true
    state.hasData = false
    mount()
    open()
    expect(await screen.findByRole('status')).toHaveTextContent('load')
    expect(screen.getByRole('button', { name: 'Add New Bank' })).toBeDisabled()
  })

  it('creates a bank when the catalog has not returned data', async () => {
    state.hasData = false
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'New Bank' } })
    submit()
    await waitFor(() =>
      expect(state.create.mutateAsync).toHaveBeenCalledWith({
        name: 'New Bank',
        abbreviation: null,
        bank_type: null,
        country_code: 'IN',
      }),
    )
  })

  it('applies the compact trigger style only when requested', () => {
    const change = mount(undefined, 'rounded-sm')
    expect(screen.getByTestId('bank-selector-trigger')).toHaveClass(
      'rounded-sm',
    )
    change.mockClear()
    cleanup()
    mount(undefined, 'w-full')
    expect(screen.getByTestId('bank-selector-trigger')).not.toHaveClass(
      'rounded-sm',
    )
  })

  it('surfaces catalog errors and retries', async () => {
    state.error = new Error('offline')
    mount()
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('error')
    expect(screen.getByRole('button', { name: 'Add New Bank' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('rejects invalid and normalized duplicate names before saving', async () => {
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'x' } })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('invalidName')
    fireEvent.change(input, { target: { value: '  EXAMPLE BANK  ' } })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('duplicate')
    expect(state.create.mutateAsync).not.toHaveBeenCalled()
  })

  it('creates a private bank and selects the returned ID', async () => {
    const onValueChange = mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Local Bank' } })
    submit()
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('new-bank'))
    expect(state.create.mutateAsync).toHaveBeenCalledWith({
      name: 'Local Bank',
      abbreviation: null,
      bank_type: null,
      country_code: 'IN',
    })
  })

  it('sends a normalised abbreviation, bank type and country', async () => {
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Paytm Payments Bank' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'abbreviation' }), {
      target: { value: ' ppbl ' },
    })
    const payments = screen.getByRole('button', { name: 'types.payments' })
    fireEvent.click(payments)
    expect(payments).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen
        .getByRole('group', { name: 'bankType' })
        .querySelectorAll('button'),
    ).toHaveLength(9)
    expect(screen.getByTestId('custom-bank-country')).toHaveTextContent('India')
    fireEvent.click(screen.getByTestId('custom-bank-country'))
    fireEvent.change(await screen.findByPlaceholderText('countrySearch'), {
      target: { value: 'Nepal' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Nepal/ }))
    submit()
    await waitFor(() =>
      expect(state.create.mutateAsync).toHaveBeenCalledWith({
        name: 'Paytm Payments Bank',
        abbreviation: 'PPBL',
        bank_type: 'payments',
        country_code: 'NP',
      }),
    )
  })

  it('rejects an invalid abbreviation before saving', async () => {
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Local Bank' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'abbreviation' }), {
      target: { value: '1' },
    })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('invalidAbbreviation')
    expect(state.create.mutateAsync).not.toHaveBeenCalled()
  })

  it('finds banks by abbreviation and shows it beside the name', async () => {
    state.banks = [
      {
        id: 'sbi',
        name: 'State Bank of India',
        logo_url: null,
        owner_id: null,
        abbreviation: 'SBI',
      } as (typeof state.banks)[number],
      { id: 'other', name: 'Other Bank', logo_url: null, owner_id: null },
    ]
    mount()
    open()
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'SBI' },
    })
    const options = await screen.findAllByTestId('bank-option')
    expect(options[0]).toHaveTextContent('State Bank of India')
    expect(options[0]).toHaveTextContent('SBI')
  })

  it('reports creation errors without losing the entered name', async () => {
    state.create.mutateAsync.mockRejectedValueOnce(
      new Error('permission denied'),
    )
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Local Bank' } })
    submit()
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        title: 'saveFailed',
        description: 'permission denied',
        type: 'error',
      }),
    )
    expect(input).toHaveValue('Local Bank')
  })

  it('uses the generic creation message for non-Error failures', async () => {
    state.create.mutateAsync.mockRejectedValueOnce('permission denied')
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'Local Bank' } })
    submit()
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        title: 'saveFailed',
        description: 'saveFailed',
        type: 'error',
      }),
    )
  })
})
