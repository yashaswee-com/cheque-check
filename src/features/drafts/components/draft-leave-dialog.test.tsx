import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { DraftLeaveDialog } from './draft-leave-dialog'

afterEach(cleanup)
it('saves and discards asynchronously, blocks dismissal while busy and permits canceling', async () => {
  let resolve!: () => void
  const save = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  const discard = vi.fn().mockResolvedValue(undefined),
    cancel = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DraftLeaveDialog
        open
        showSave
        onSave={save}
        onDiscard={discard}
        onCancel={cancel}
      />
    </NextIntlClientProvider>,
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Drafts.saveDraft }),
  )
  expect(save).toHaveBeenCalledOnce()
  expect(
    screen.getByRole('button', { name: messages.Drafts.discard }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: messages.Common.close }))
  expect(cancel).not.toHaveBeenCalled()
  resolve()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: messages.Drafts.discard }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: messages.Drafts.discard }))
  await waitFor(() => expect(discard).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: messages.Drafts.keepEditing }),
    ).toBeEnabled(),
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Drafts.keepEditing }),
  )
  expect(cancel).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: messages.Common.close }))
  expect(cancel).toHaveBeenCalledTimes(2)
})

it('offers only discard and keep editing when the draft is already saved', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DraftLeaveDialog
        open
        showSave={false}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />
    </NextIntlClientProvider>,
  )
  expect(
    screen.queryByRole('button', { name: messages.Drafts.saveDraft }),
  ).not.toBeInTheDocument()
  expect(
    screen
      .getByRole('button', { name: messages.Drafts.discard })
      .querySelector('svg'),
  ).not.toBeNull()
  expect(
    screen.getByRole('button', { name: messages.Drafts.keepEditing }),
  ).toBeInTheDocument()
})
