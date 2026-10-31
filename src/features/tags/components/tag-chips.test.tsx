import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import type { Tag } from '@/types'
import { EntityTagsSection, TagChips } from './tag-chips'
import { TagColorPicker } from './tag-color-picker'
import { TAG_COLORS } from '../lib/tag-colors'
const state = vi.hoisted(() => ({ tags: [] as Tag[], isLoading: false }))
vi.mock('../hooks/use-entity-tags', () => ({ useEntityTags: () => state }))
afterEach(cleanup)
const tags = [
  { id: 'one', name: 'Urgent', color: '#ff0000' },
  { id: 'two', name: 'Paid', color: '#00ff00' },
] as Tag[]
it('renders linked tags and a hidden-count chip', () => {
  render(<TagChips tags={tags} max={1} linked />)
  expect(screen.getByRole('link', { name: 'Urgent' })).toHaveAttribute(
    'href',
    '/tags/one',
  )
  expect(screen.getByText('+1')).toBeInTheDocument()
})
it('renders loading, empty and populated entity sections', () => {
  state.isLoading = true
  const { container, rerender } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntityTagsSection entityType="cheque" entityId="one" />
    </NextIntlClientProvider>,
  )
  expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  state.isLoading = false
  state.tags = []
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntityTagsSection entityType="cheque" entityId="one" />
    </NextIntlClientProvider>,
  )
  expect(container).toBeEmptyDOMElement()
  state.tags = tags
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntityTagsSection entityType="cheque" entityId="one" />
    </NextIntlClientProvider>,
  )
  expect(screen.getByRole('link', { name: 'Paid' })).toHaveAttribute(
    'href',
    '/tags/two',
  )
})
it('emits the selected tag color and recognizes uppercase values', () => {
  const change = vi.fn()
  render(
    <TagColorPicker
      value={TAG_COLORS[0].value.toUpperCase()}
      onChange={change}
      label="Color"
    />,
  )
  expect(screen.getByRole('radio', { name: TAG_COLORS[0].name })).toBeChecked()
  fireEvent.click(screen.getByRole('radio', { name: TAG_COLORS[1].name }))
  expect(change).toHaveBeenCalledWith(TAG_COLORS[1].value)
})
