import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Combobox } from './combobox'

beforeEach(() => {
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
  vi.unstubAllGlobals()
})
const options = [
  { label: 'Main', value: 'main', color: '#ff0000' },
  { label: 'Savings', value: 'savings' },
]

it('selects and clears existing options', async () => {
  const change = vi.fn()
  const { rerender } = render(
    <Combobox options={options} onValueChange={change} testId="account" />,
  )
  fireEvent.click(screen.getByTestId('account'))
  fireEvent.click(await screen.findByTestId('account-option-main'))
  expect(change).toHaveBeenCalledWith('main')
  rerender(
    <Combobox
      options={options}
      value="main"
      onValueChange={change}
      testId="account"
    />,
  )
  fireEvent.click(screen.getByTestId('account'))
  fireEvent.click(await screen.findByTestId('account-option-main'))
  expect(change).toHaveBeenLastCalledWith('')
})

it('works without an optional test identifier', async () => {
  const change = vi.fn()
  render(<Combobox options={options} onValueChange={change} />)
  fireEvent.click(screen.getByRole('button'))
  fireEvent.click((await screen.findByText('Savings')).closest('[cmdk-item]')!)
  expect(change).toHaveBeenCalledWith('savings')
})

it('creates a trimmed new option and resets the query when dismissed', async () => {
  const create = vi.fn()
  render(
    <Combobox
      options={options}
      onValueChange={vi.fn()}
      onCreateClick={create}
      testId="account"
      className="bg-muted border-none"
    />,
  )
  fireEvent.click(screen.getByTestId('account'))
  fireEvent.change(await screen.findByTestId('account-search'), {
    target: { value: '  New account  ' },
  })
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add new "New account"' }),
  )
  expect(create).toHaveBeenCalledWith('New account')
  fireEvent.click(screen.getByTestId('account'))
  fireEvent.keyDown(screen.getByTestId('account-search'), { key: 'Escape' })
  fireEvent.click(screen.getByTestId('account'))
  expect(await screen.findByTestId('account-search')).toHaveValue('')
})

it.each(['/accounts/new', '/accounts/new?source=cheque'])(
  'encodes creation links for %s',
  async (createUrl) => {
    render(
      <Combobox
        options={options}
        onValueChange={vi.fn()}
        createUrl={createUrl}
        testId="account"
      />,
    )
    fireEvent.click(screen.getByTestId('account'))
    fireEvent.change(await screen.findByTestId('account-search'), {
      target: { value: 'A & B' },
    })
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      `${createUrl}${createUrl.includes('?') ? '&' : '?'}name=A%20%26%20B`,
    )
  },
)

it('shows the create action instead of the empty message when there are no records', async () => {
  const create = vi.fn()
  render(
    <Combobox
      options={[]}
      onValueChange={vi.fn()}
      onCreateClick={create}
      createLabel="Add party"
      testId="party"
    />,
  )
  fireEvent.click(screen.getByTestId('party'))
  expect(screen.queryByText('No option found.')).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Add party' }))
  expect(create).toHaveBeenCalledWith('')
})

it('links to the create page from the empty state, keeping any query', async () => {
  render(
    <Combobox
      options={[]}
      onValueChange={vi.fn()}
      createUrl="/accounts/new"
      testId="account"
    />,
  )
  fireEvent.click(screen.getByTestId('account'))
  expect(await screen.findByTestId('account-create')).toHaveAttribute(
    'href',
    '/accounts/new',
  )
  fireEvent.change(screen.getByTestId('account-search'), {
    target: { value: 'HDFC' },
  })
  expect(await screen.findByTestId('account-create')).toHaveAttribute(
    'href',
    '/accounts/new?name=HDFC',
  )
  expect(screen.getAllByTestId('account-create')).toHaveLength(1)
})

it('keeps the empty message when records exist but none match', async () => {
  render(
    <Combobox options={options} onValueChange={vi.fn()} testId="account" />,
  )
  fireEvent.click(screen.getByTestId('account'))
  fireEvent.change(await screen.findByTestId('account-search'), {
    target: { value: 'zzz' },
  })
  expect(await screen.findByText('No option found.')).toBeInTheDocument()
})
