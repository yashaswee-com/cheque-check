import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { StickyPagination } from './sticky-pagination'
import {
  ShellBottomSlot,
  ShellBottomSlotProvider,
} from '@/components/shell-bottom-slot'
import { usePagedItems } from '@/hooks/use-paged-items'

afterEach(cleanup)

function bar(props: Partial<Parameters<typeof StickyPagination>[0]> = {}) {
  return (
    <StickyPagination
      page={1}
      totalPages={4}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      {...props}
    />
  )
}

function mount(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )
}

describe('StickyPagination', () => {
  it('shows icon controls around a page / total status', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    mount(bar({ onPrevious, onNext }))
    expect(screen.getByTestId('sticky-pagination-status')).toHaveTextContent(
      '2 / 4',
    )
    expect(screen.getByTestId('sticky-pagination-status')).toHaveAccessibleName(
      'Page 2 of 4',
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.previousPage }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    )
    expect(onPrevious).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.getByTestId('sticky-pagination')).toHaveClass(
      'sticky',
      'bottom-0',
    )
  })

  it('disables the edges and hides itself for a single page', () => {
    const { rerender } = mount(bar({ page: 0, totalPages: 2 }))
    expect(
      screen.getByRole('button', { name: messages.SharedUI.previousPage }),
    ).toBeDisabled()
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        {bar({ page: 1, totalPages: 2 })}
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    ).toBeDisabled()
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        {bar({ page: 0, totalPages: 1 })}
      </NextIntlClientProvider>,
    )
    expect(screen.queryByTestId('sticky-pagination')).toBeNull()
  })

  it('docks into the shell slot above the bottom nav and scrolls the page to the top', () => {
    const scrollTo = vi.fn()
    mount(
      <ShellBottomSlotProvider>
        <main
          data-page-scroll
          ref={(node) => {
            if (node) node.scrollTo = scrollTo
          }}
        >
          {bar()}
        </main>
        <ShellBottomSlot />
      </ShellBottomSlotProvider>,
    )
    const slot = screen.getByTestId('shell-bottom-slot')
    const nav = screen.getByTestId('sticky-pagination')
    expect(slot).toContainElement(nav)
    expect(nav).not.toHaveClass('sticky')
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    )
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })
})

describe('usePagedItems', () => {
  const items = Array.from({ length: 45 }, (_, index) => index)

  it('slices pages, clamps navigation and resets when criteria change', () => {
    const { result, rerender } = renderHook(
      ({ list, key }) => usePagedItems(list, key),
      { initialProps: { list: items, key: 'a' } },
    )
    expect(result.current.totalPages).toBe(3)
    expect(result.current.items).toHaveLength(20)
    act(() => result.current.next())
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.page).toBe(2)
    expect(result.current.items).toEqual([40, 41, 42, 43, 44])
    rerender({ list: items, key: 'b' })
    expect(result.current.page).toBe(0)
    act(() => result.current.next())
    rerender({ list: items.slice(0, 10), key: 'b' })
    expect(result.current.page).toBe(0)
    expect(result.current.totalPages).toBe(1)
    act(() => result.current.previous())
    expect(result.current.page).toBe(0)
  })

  it('treats a missing list as one empty page', () => {
    const { result } = renderHook(() => usePagedItems(undefined, ''))
    expect(result.current.items).toBeUndefined()
    expect(result.current.totalPages).toBe(1)
  })
})
