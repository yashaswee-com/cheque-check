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

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  isLoading: false,
  tags: [
    { id: 'tag-1', name: 'Urgent', color: '#ff0000' },
    { id: 'tag-2', name: 'Paid', color: '#00ff00' },
  ],
}))
vi.mock('@/features/tags/hooks/use-tags', () => ({
  useTags: () => ({
    tags: mocks.tags,
    isLoading: mocks.isLoading,
    isCreating: false,
    createTag: mocks.create,
  }),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.isLoading = false
  mocks.tags = [
    { id: 'tag-1', name: 'Urgent', color: '#ff0000' },
    { id: 'tag-2', name: 'Paid', color: '#00ff00' },
  ]
})

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
  it('removes a selected tag and creates a trimmed new tag', async () => {
    const change = vi.fn()
    mocks.create.mockResolvedValue({ id: 'new' })
    selector(change)
    fireEvent.click(screen.getByTestId('tag-selector-trigger'))
    fireEvent.click(await screen.findByTestId('tag-selector-option-tag-1'))
    expect(change).toHaveBeenCalledWith([])
    fireEvent.change(screen.getByTestId('tag-selector-create-input'), {
      target: { value: '  Invoice  ' },
    })
    fireEvent.click(screen.getByTestId('tag-selector-create-button'))
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(['tag-1', 'new']),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Invoice' }),
    )
    expect(screen.getByTestId('tag-selector-create-input')).toHaveValue('')
  })

  it('renders selected and catalog placeholders while tags load', async () => {
    mocks.isLoading = true
    selector()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tag-selector-trigger'))
    await screen.findByRole('dialog')
    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(3)
  })

  it('shows an empty state after the tag catalog finishes loading', async () => {
    mocks.tags = []
    selector()
    fireEvent.click(screen.getByTestId('tag-selector-trigger'))
    expect(
      await screen.findByText(messages.SharedUI.noTags),
    ).toBeInTheDocument()
  })
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
