import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackService } from './feedback.service'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  myItems: vi.fn(),
  roadmap: vi.fn(),
  vote: vi.fn(),
}))
vi.mock('@/features/feedback/repositories/feedback.repository', () => ({
  feedbackRepository: mocks,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('feedback service validation', () => {
  it('normalizes and submits only the supported fields', async () => {
    mocks.submit.mockResolvedValue({ id: 'item' })
    await feedbackService.submit(
      {
        category: 'feature',
        title: '  Better export filters  ',
        description: '  Add reusable filters to exported reports.  ',
      },
      '10000000-0000-4000-8000-000000000001',
    )
    expect(mocks.submit).toHaveBeenCalledWith(
      {
        category: 'feature',
        title: 'Better export filters',
        description: 'Add reusable filters to exported reports.',
      },
      '10000000-0000-4000-8000-000000000001',
    )
  })

  it('rejects invalid text and oversized pages before repository access', async () => {
    await expect(
      feedbackService.submit(
        { category: 'bug', title: 'x', description: 'short' },
        '10000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(feedbackService.roadmap({ limit: 51 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.roadmap).not.toHaveBeenCalled()
  })
})
