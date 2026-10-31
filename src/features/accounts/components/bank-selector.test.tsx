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
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
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
  fireEvent.click(await screen.findByRole('button', { name: 'add' }))
  return screen.findByRole('textbox', { name: 'name' })
}
function submit() {
  const input = screen.getByRole('textbox', { name: 'name' })
  const form = input.closest('form')
  if (!form) throw new Error('Bank creation form missing')
  fireEvent.submit(form)
}

describe('BankSelector', () => {
  it('removes a selected private bank only after name confirmation', async () => {
    state.banks[0].owner_id = 'user'
    const change = mount('bank1')
    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
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

  it('closes the create dialog without saving', async () => {
    mount()
    await addForm()
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(state.create.mutateAsync).not.toHaveBeenCalled()
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
    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled()
  })

  it('creates a bank when the catalog has not returned data', async () => {
    state.hasData = false
    mount()
    const input = await addForm()
    fireEvent.change(input, { target: { value: 'New Bank' } })
    submit()
    await waitFor(() =>
      expect(state.create.mutateAsync).toHaveBeenCalledWith('New Bank'),
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
    expect(state.create.mutateAsync).toHaveBeenCalledWith('Local Bank')
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
