import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createToastManager, Toaster } from './toast'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(cleanup)

describe('Toaster', () => {
  it.each(['success', 'info', 'warning', 'error', 'loading', 'plain'])(
    'displays %s notifications with descriptions and appropriate icons',
    async (type) => {
      const manager = createToastManager()
      render(<Toaster toastManager={manager} timeout={0} />)
      act(() => {
        manager.add({ title: 'Saved', description: 'Cheque saved', type })
      })
      expect(await screen.findByText('Saved')).toBeInTheDocument()
      expect(screen.getByText('Cheque saved')).toBeInTheDocument()
      const icon = document.querySelector('[data-slot="toast-icon"]')
      if (type === 'plain') expect(icon).toBeNull()
      else expect(icon).toBeInTheDocument()
      if (type === 'loading')
        expect(icon?.querySelector('svg')).toHaveClass('animate-spin')
      act(() => screen.getByRole('dialog', { name: 'Saved' }).focus())
      fireEvent.click(await screen.findByRole('button', { name: 'close' }))
      await waitFor(() =>
        expect(screen.queryByText('Saved')).not.toBeInTheDocument(),
      )
    },
  )

  it('exposes notification actions and can update an existing notification', async () => {
    const manager = createToastManager()
    const undo = vi.fn()
    render(<Toaster toastManager={manager} timeout={0} />)
    let id = ''
    act(() => {
      id = manager.add({
        title: 'Deleted',
        actionProps: { children: 'Undo', onClick: undo },
      })
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
    act(() => manager.update(id, { title: 'Restored', type: 'success' }))
    expect(await screen.findByText('Restored')).toBeInTheDocument()
  })
})
