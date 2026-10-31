import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftCard } from './draft-card'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(cleanup)

const props = {
  href: '/cheques/create?draftId=d1',
  title: 'Asha cheque',
  subtitle: 'Asha',
  meta: '#000001',
  updatedAt: '2026-10-31T12:00:00Z',
  avatar: { name: 'Asha' },
}

describe('DraftCard', () => {
  it('requires confirmation only for a long left swipe', () => {
    render(<DraftCard {...props} onDelete={vi.fn()} />)
    const card = screen.getByRole('link').parentElement!
    const swipe = (distance: number) => {
      fireEvent.mouseDown(card, { clientX: 300, clientY: 100, buttons: 1 })
      fireEvent.mouseMove(document, {
        clientX: 300 + distance,
        clientY: 100,
        buttons: 1,
      })
      fireEvent.mouseUp(document, { clientX: 300 + distance, clientY: 100 })
    }
    swipe(100)
    swipe(-80)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    swipe(-200)
    expect(screen.getByRole('dialog')).toHaveTextContent('deleteDescription')
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('links to the draft without deleting on selection', () => {
    const onDelete = vi.fn()
    render(<DraftCard {...props} onDelete={onDelete} />)
    expect(screen.getByRole('link', { name: 'Asha cheque' })).toHaveAttribute(
      'href',
      props.href,
    )
    expect(screen.getByText('Asha')).toBeInTheDocument()
    expect(screen.getByText(/#000001/)).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('requires confirmation and permits canceling', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<DraftCard {...props} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'deleteDescription',
    )
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    const buttons = await screen.findAllByRole('button', { name: 'delete' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})
