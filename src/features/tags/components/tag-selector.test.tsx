import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagSelector } from './tag-selector'
import messages from '../../../../messages/en.json'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/features/tags/hooks/use-tags', () => ({
  useTags: () => ({
    tags: [
      { id: 'tag-1', name: 'Urgent', color: '#ff0000' },
      { id: 'tag-2', name: 'Paid', color: '#00ff00' },
    ],
    isLoading: false,
    isCreating: false,
    createTag: mocks.create,
  }),
}))
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

function selector(onChange = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TagSelector
        businessId="business"
        value={['tag-1']}
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  )
}

describe('Tag Selector modal backdrop', () => {
  it('dims only its own overlay, supports multiselect, Escape and focus return', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    selector(change)
    const trigger = screen.getByTestId('tag-selector-trigger')
    await user.click(trigger)
    expect(
      document.querySelector('[data-slot="popover-backdrop"]'),
    ).toHaveClass('backdrop-blur-sm')
    expect(
      screen.getByRole('dialog', { name: messages.SharedUI.addTags }),
    ).not.toHaveClass('backdrop-blur-sm')
    await user.click(screen.getByRole('button', { name: 'Paid' }))
    expect(change).toHaveBeenCalledWith(['tag-1', 'tag-2'])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(trigger).toHaveFocus())
    await user.click(trigger)
    await user.click(document.querySelector('[data-slot="popover-backdrop"]')!)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('rejects repeated Enter submissions while tag creation is pending and shows failures', async () => {
    const user = userEvent.setup()
    let reject!: (reason: Error) => void
    mocks.create.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail
      }),
    )
    selector()
    await user.click(screen.getByTestId('tag-selector-trigger'))
    const input = screen.getByRole('textbox', {
      name: messages.SharedUI.newTag,
    })
    fireEvent.change(input, { target: { value: 'Invoice' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
    reject(new Error('Unavailable'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.SharedUI.createTagFailed,
    )
  })

  it('closes only the nested selector on Escape, leaving its parent dialog open', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Edit cheque</DialogTitle>
            <DialogDescription>Choose cheque tags</DialogDescription>
            <TagSelector businessId="business" value={[]} onChange={vi.fn()} />
          </DialogContent>
        </Dialog>
      </NextIntlClientProvider>,
    )
    const trigger = screen.getByTestId('tag-selector-trigger')
    await user.click(trigger)
    expect(
      screen.getByRole('dialog', { name: messages.SharedUI.addTags }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: messages.SharedUI.addTags }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('dialog', { name: 'Edit cheque' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
