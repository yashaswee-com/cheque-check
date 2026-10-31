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
    data: state.banks,
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
function mount(value?: string) {
  const onValueChange = vi.fn()
  render(<BankSelector value={value} onValueChange={onValueChange} />)
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
    mount()
    open()
    expect(await screen.findByRole('status')).toHaveTextContent('load')
    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled()
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
})
