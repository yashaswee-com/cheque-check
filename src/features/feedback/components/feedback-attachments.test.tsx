import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import {
  FeedbackAttachments,
  FeedbackAttachmentsProvider,
} from './feedback-attachments'

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  download: vi.fn(),
  query: {
    data: [
      { id: 'attachment-1', feedback_id: 'feedback-1', filename: 'note.txt' },
      { id: 'attachment-2', feedback_id: 'feedback-2', filename: 'other.txt' },
    ],
    error: null as Error | null,
  },
}))

vi.mock('../hooks/use-feedback', () => ({
  useFeedbackAttachments: () => ({ ...mocks.query, refetch: mocks.refetch }),
  useFeedbackAttachmentDownload: () => ({ mutateAsync: mocks.download }),
}))

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FeedbackAttachmentsProvider ids={['feedback-1', 'feedback-2']}>
        <FeedbackAttachments feedbackId="feedback-1" />
      </FeedbackAttachmentsProvider>
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.error = null
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('feedback attachments', () => {
  it('shows a metadata loading error with a retry action', () => {
    mocks.query.error = new Error('Request failed')
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.Feedback.attachmentsLoadFailed,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Feedback.retry }),
    )
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('downloads only attachments belonging to the displayed feedback', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    mocks.download.mockResolvedValue({
      filename: 'note.txt',
      mime_type: 'text/plain',
      data: 'aGVsbG8=',
    })
    mount()
    expect(screen.queryByRole('button', { name: 'other.txt' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'note.txt' }))
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(mocks.download).toHaveBeenCalledWith('attachment-1')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('reports a failed download and allows retrying', async () => {
    mocks.download.mockRejectedValueOnce(new Error('Request failed'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'note.txt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.Feedback.attachmentDownloadFailed,
    )
    expect(screen.getByRole('button', { name: 'note.txt' })).toBeEnabled()
  })
})
