import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditableAvatar } from './editable-avatar'

const mocks = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/services/storage.service', () => ({ storageService: mocks }))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))
const drawImage = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.uploadAvatar.mockResolvedValue('avatars/uploaded.png')
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 200
      naturalHeight = 100
      decode = vi.fn().mockResolvedValue(undefined)
    },
  )
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:avatar'),
      revokeObjectURL: vi.fn(),
    }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['cropped'], { type: 'image/png' })),
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function openEditor(
  props: Partial<React.ComponentProps<typeof EditableAvatar>> = {},
) {
  const onUpload = vi.fn().mockResolvedValue(undefined)
  const view = render(
    <EditableAvatar name="Asha" onUpload={onUpload} {...props} />,
  )
  fireEvent.click(screen.getByRole('button'))
  return { ...view, onUpload }
}
function selectFile(
  file = new File(['original'], 'avatar.png', { type: 'image/png' }),
) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('Avatar file input missing')
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

describe('EditableAvatar', () => {
  it('center-crops and uploads a selected image, then persists and notifies', async () => {
    const { onUpload } = openEditor()
    selectFile()
    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith('avatars/uploaded.png'),
    )
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      50,
      0,
      100,
      100,
      0,
      0,
      100,
      100,
    )
    const uploaded = mocks.uploadAvatar.mock.calls[0][0] as File
    expect(uploaded.name).toBe('avatar.png')
    expect(uploaded.type).toBe('image/png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'avatarUpdated',
        type: 'success',
      }),
    )
  })

  it.each(['canvas', 'blob'])(
    'uploads the original file if %s conversion is unavailable',
    async (unavailable) => {
      if (unavailable === 'canvas')
        vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
      else
        vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
          (callback) => callback(null),
        )
      openEditor()
      const file = selectFile()
      await waitFor(() => expect(mocks.uploadAvatar).toHaveBeenCalledWith(file))
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    },
  )

  it('keeps the dialog usable after an upload failure', async () => {
    const failure = new Error('storage unavailable')
    mocks.uploadAvatar.mockRejectedValueOnce(failure)
    const { onUpload } = openEditor()
    selectFile()
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'Error uploading avatar',
        failure,
      ),
    )
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        description: 'avatarUploadFailed',
      }),
    )
    expect(onUpload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'uploadNew' })).toBeEnabled()
  })

  it('ignores an empty file selection', () => {
    openEditor()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('Avatar file input missing')
    fireEvent.change(input, { target: { files: [] } })
    expect(mocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it('opens the file picker when requesting a new avatar', () => {
    openEditor()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('Avatar file input missing')
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'uploadNew' }))
    expect(click).toHaveBeenCalledOnce()
  })

  it('deletes an existing avatar only through its callback', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    openEditor({ imageUrl: '/avatar.png', onDelete })
    const remove = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('text-destructive'))
    if (!remove) throw new Error('Avatar removal button missing')
    fireEvent.click(remove)
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'avatarRemoved',
        type: 'success',
      }),
    )
    expect(mocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it('does not offer deletion when no delete callback is provided', () => {
    openEditor({ imageUrl: '/avatar.png' })
    expect(
      screen.queryByRole('button', { name: 'remove' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Asha' })).toBeInTheDocument()
  })

  it('notifies deletion failures and permits another attempt', async () => {
    const failure = new Error('cannot delete')
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined)
    openEditor({ imageUrl: '/avatar.png', onDelete })
    const remove = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('text-destructive'))
    if (!remove) throw new Error('Avatar removal button missing')
    fireEvent.click(remove)
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'Error deleting avatar',
        failure,
      ),
    )
    expect(remove).toBeEnabled()
    fireEvent.click(remove)
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'avatarRemoved' }),
      ),
    )
    expect(onDelete).toHaveBeenCalledTimes(2)
  })
})
