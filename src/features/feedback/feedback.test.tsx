import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import FeedbackPage from '@/app/(dashboard)/feedback/page'
import CreateFeedbackPage from '@/app/(dashboard)/feedback/create/page'
import { FeedbackCenter } from './components/feedback-center'
import { Roadmap } from './components/roadmap'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  push: vi.fn(),
  redirect: vi.fn(),
  toast: vi.fn(),
  vote: vi.fn(),
  myFeedback: vi.fn(),
  privatePage: {
    data: {
      items: [
        {
          id: '10000000-0000-4000-8000-000000000201',
          category: 'feature',
          title: 'Private request',
          description: 'Visible only in this account submission history.',
          status: 'under_review',
          roadmap_published: false,
          created_at: '2026-11-01T10:00:00Z',
        },
      ],
      next_cursor: null,
    },
    isLoading: false,
    isFetching: false,
    isPending: false,
    isStale: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  roadmapPage: {
    data: {
      items: [
        {
          id: '10000000-0000-4000-8000-000000000202',
          title: 'Per-account reminders',
          description: 'Use a different reminder schedule per account.',
          status: 'planned',
          vote_count: 2,
          has_voted: false,
          created_at: '2026-11-01T10:00:00Z',
        },
      ],
      next_cursor: null,
    },
    isLoading: false,
    isFetching: false,
    error: null,
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  redirect: (href: string) => {
    mocks.redirect(href)
    throw new Error('NEXT_REDIRECT')
  },
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))

vi.mock('./hooks/use-feedback', () => ({
  useMyFeedback: (request: unknown) => {
    mocks.myFeedback(request)
    return mocks.privatePage
  },
  useSubmitFeedback: () => ({
    mutateAsync: mocks.submit,
    isPending: false,
  }),
  useRoadmap: () => mocks.roadmapPage,
  useRoadmapVote: () => ({
    mutateAsync: mocks.vote,
    isPending: false,
  }),
}))

const privateData = mocks.privatePage.data

function mount(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.privatePage.isLoading = false
  mocks.privatePage.isFetching = false
  mocks.privatePage.isPending = false
  mocks.privatePage.isStale = false
  mocks.privatePage.error = null
  mocks.privatePage.data = privateData
  mocks.submit.mockResolvedValue(undefined)
  mocks.vote.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('feedback center', () => {
  it('prefills the private bug form from the Report issue route', async () => {
    const page = await CreateFeedbackPage({
      searchParams: Promise.resolve({ category: 'bug' }),
    })
    mount(page)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Report a bug' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
  })
  it('keeps existing Report issue links working through the new create route', async () => {
    await expect(
      FeedbackPage({
        searchParams: Promise.resolve({ category: 'bug' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/feedback/create?category=bug')
  })

  it('prefills Report issue, submits only category/title/description, and resets the form', async () => {
    mount(<FeedbackCenter mode="create" initialCategory="bug" />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Report a bug' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Camera scan is stuck' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: {
        value: 'The scanner stays on the loading screen after capture.',
      },
    })
    expect(document.querySelector('input[type="file"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith({
        category: 'bug',
        title: 'Camera scan is stuck',
        description: 'The scanner stays on the loading screen after capture.',
      }),
    )
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/feedback'))
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.Feedback.submitSuccess,
      type: 'success',
    })
    expect(
      screen.getAllByRole('button', { name: 'Send feedback' }),
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Send feedback' }),
    ).toHaveAttribute('form', 'feedback-create-form')
  })

  it('shows only the signed-in user submission list and its admin status', () => {
    mount(<FeedbackCenter />)
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByText('Private request')).toBeInTheDocument()
    expect(screen.getByText('Under review')).toBeInTheDocument()
    expect(
      screen.getByText('Visible only in this account submission history.'),
    ).toBeInTheDocument()
  })

  it('sends search and filter controls to the private list and resets the cursor', () => {
    mount(<FeedbackCenter />)
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search feedback' }),
      {
        target: { value: 'camera' },
      },
    )
    expect(mocks.myFeedback).toHaveBeenLastCalledWith({
      limit: 25,
      search: 'camera',
      before: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sort & Filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Planned' }))
    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.click(screen.getByRole('button', { name: 'Oldest first' }))
    expect(mocks.myFeedback).toHaveBeenLastCalledWith({
      limit: 25,
      search: 'camera',
      status: 'planned',
      category: 'bug',
      order: 'asc',
      before: undefined,
    })
  })

  it('maps the database submission throttle to a clear message', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('FEEDBACK_RATE_LIMIT'))
    mount(<FeedbackCenter mode="create" />)
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Another issue' },
    })

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'This report is complete and describes an issue.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can send up to five submissions per hour. Please try again later.',
    )
  })

  it('keeps loaded results visible during refresh and offers retry after refresh failure', () => {
    mocks.privatePage.isFetching = true
    const view = mount(<FeedbackCenter />)
    expect(screen.getByText('Refreshing feedback…')).toBeInTheDocument()
    expect(screen.getByText('Private request')).toBeInTheDocument()
    mocks.privatePage.isFetching = false
    mocks.privatePage.error = new Error('network')
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FeedbackCenter />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Private request')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.privatePage.refetch).toHaveBeenCalledOnce()
  })

  it('shows stale data with an explicit refresh action', () => {
    mocks.privatePage.isStale = true
    mount(<FeedbackCenter />)
    expect(screen.getByText('Feedback may be out of date.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mocks.privatePage.refetch).toHaveBeenCalledOnce()
  })

  it('distinguishes idle, loading, error, and empty list states', () => {
    Object.assign(mocks.privatePage, {
      data: undefined,
      isPending: true,
      isFetching: false,
    })
    const view = mount(<FeedbackCenter />)
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.Common.loading,
    )
    Object.assign(mocks.privatePage, { isLoading: true, isFetching: true })
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FeedbackCenter />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.Common.loading,
    )
    Object.assign(mocks.privatePage, {
      isLoading: false,
      isFetching: false,
      isPending: false,
      error: new Error('failed'),
    })
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FeedbackCenter />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.Common.loadDataError,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.privatePage.refetch).toHaveBeenCalledOnce()
    Object.assign(mocks.privatePage, {
      error: null,
      data: { items: [], next_cursor: null },
    })
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FeedbackCenter />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByText(messages.Feedback.noSubmissions),
    ).toBeInTheDocument()
  })

  it('prevents submission while offline without clearing the form', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mount(<FeedbackCenter mode="create" />)
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Offline issue' },
    })
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeDisabled()
    expect(
      screen.getByText(messages.Feedback.offlineNotice),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Offline issue')
    vi.restoreAllMocks()
  })
})

describe('published roadmap', () => {
  it('shows only published feature requests, their status, and a single-vote toggle', async () => {
    mount(<Roadmap />)
    expect(
      screen.getByRole('link', { name: messages.Feedback.suggestFeature }),
    ).toHaveAttribute('href', '/feedback/create?category=feature')
    expect(screen.getByText('Per-account reminders')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    const vote = screen.getByRole('button', { name: /Vote/ })
    expect(vote).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(vote)
    await waitFor(() =>
      expect(mocks.vote).toHaveBeenCalledWith({
        feedbackId: '10000000-0000-4000-8000-000000000202',
        hasVoted: false,
      }),
    )
  })
})
