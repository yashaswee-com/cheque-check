import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteConfirmationDialog } from './delete-dialog'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key} ${values.name}` : key,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DeleteConfirmationDialog', () => {
  it('requires an exact typed name before deleting', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    render(
      <DeleteConfirmationDialog
        open
        title="Delete account"
        description="Permanent action"
        confirmName="Main"
        onDelete={onDelete}
        onOpenChange={onOpenChange}
      />,
    )
    const confirm = screen.getByTestId('delete-dialog-confirm-button')
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'main' },
    })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'Main' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('blocks duplicate deletion while the request is pending', async () => {
    let finish: (() => void) | undefined
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(
      <DeleteConfirmationDialog
        open
        title="Delete"
        description="Permanent"
        confirmName="Main"
        onDelete={onDelete}
      />,
    )
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'Main' },
    })
    const confirm = screen.getByTestId('delete-dialog-confirm-button')
    fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onDelete).toHaveBeenCalledOnce()
    if (!finish) throw new Error('Deletion did not start')
    finish()
    await waitFor(() => expect(confirm).toBeEnabled())
  })

  it('surfaces deletion errors and preserves the confirmation for retry', async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Not permitted'))
      .mockResolvedValue(undefined)
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    const onOpenChange = vi.fn()
    render(
      <DeleteConfirmationDialog
        open
        title="Delete"
        description="Permanent"
        confirmName="Main"
        onDelete={onDelete}
        onOpenChange={onOpenChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'Main' },
    })
    fireEvent.click(screen.getByTestId('delete-dialog-confirm-button'))
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Not permitted'))
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('delete-dialog-confirm-button'))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onDelete).toHaveBeenCalledTimes(2)
  })

  it('stringifies non-Error deletion failures for the browser alert', async () => {
    const onDelete = vi.fn().mockRejectedValue('permission denied')
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    render(
      <DeleteConfirmationDialog
        open
        title="Delete"
        description="Permanent"
        confirmName="Main"
        onDelete={onDelete}
      />,
    )
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'Main' },
    })
    fireEvent.click(screen.getByTestId('delete-dialog-confirm-button'))
    await waitFor(() => expect(alert).toHaveBeenCalledWith('permission denied'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('supports an uncontrolled trigger and closes after successful deletion', async () => {
    render(
      <DeleteConfirmationDialog
        title="Delete account"
        description="Permanent"
        confirmName="Main"
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('typeToConfirm Main'), {
      target: { value: 'Main' },
    })
    fireEvent.click(screen.getByTestId('delete-dialog-confirm-button'))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})
