import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { DefaultAccountField } from './default-account-field'

const getAll = vi.hoisted(() => vi.fn())
vi.mock('../services/account.service', () => ({ accountService: { getAll } }))
const previous = {
  id: 'previous',
  account_name: 'Operating',
  account_number: '123456781234',
  is_default: true,
  bank: { name: 'HDFC Bank' },
}
beforeEach(() => {
  vi.resetAllMocks()
  getAll.mockResolvedValue([previous])
})
afterEach(cleanup)

function mount(accountId?: string, checked = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Form() {
    const [selected, setSelected] = useState(checked)
    return (
      <DefaultAccountField
        businessId="business"
        accountId={accountId}
        checked={selected}
        onCheckedChange={setSelected}
      />
    )
  }
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <Form />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

it('explains replacement only after selecting another default and masks the previous number', async () => {
  mount('new')
  await waitFor(() =>
    expect(screen.getByRole('checkbox')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    ),
  )
  expect(screen.queryByText(/Saving will replace/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('status')).toHaveTextContent(
    'Saving will replace HDFC Bank ••••1234',
  )
  expect(screen.queryByText(/123456781234/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.queryByText(/Saving will replace/)).not.toBeInTheDocument()
  expect(getAll).toHaveBeenCalledWith('business')
})

it('does not warn when editing the existing default or when no default exists', async () => {
  const { unmount } = mount('previous', true)
  await waitFor(() =>
    expect(screen.getByRole('checkbox')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    ),
  )
  expect(screen.queryByText(/Saving will replace/)).not.toBeInTheDocument()
  unmount()
  getAll.mockResolvedValue([])
  mount('new', true)
  await waitFor(() =>
    expect(screen.getByRole('checkbox')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    ),
  )
  expect(screen.getByText(messages.Accounts.defaultAccountHelp)).toBeVisible()
})

it('blocks a replacement when loading fails and offers an explicit retry', async () => {
  getAll
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([previous])
  mount('new', true)
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    messages.Common.loadDataError,
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Common.tryAgain }),
  )
  await waitFor(() =>
    expect(screen.getByRole('checkbox')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    ),
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'Saving will replace HDFC Bank',
  )
})
