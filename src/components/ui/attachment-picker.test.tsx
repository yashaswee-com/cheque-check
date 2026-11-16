import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AttachmentPicker } from './attachment-picker'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('uses the supplied file types and cleans up image previews', () => {
  const createObjectURL = vi.fn(() => 'blob:preview')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
  )
  const file = new File(['image'], 'preview.png', { type: 'image/png' })
  const { unmount } = render(
    <AttachmentPicker
      files={[file]}
      onChange={vi.fn()}
      onInvalid={vi.fn()}
      validate={() => true}
      label="Upload"
      hint="Choose an image"
      accept="image/png"
      removeLabel={(name) => `Remove ${name}`}
    />,
  )
  expect(screen.getByLabelText('Upload')).toHaveAttribute('accept', 'image/png')
  expect(createObjectURL).toHaveBeenCalledWith(file)
  expect(screen.getByRole('presentation')).toHaveAttribute(
    'src',
    'blob:preview',
  )
  unmount()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')
})
