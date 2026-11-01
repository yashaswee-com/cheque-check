import { describe, expect, it } from 'vitest'
import { runFeedbackScaling } from '../lib/feedback-scaling'

describe('feedback roadmap scaling fixture', () => {
  it('measures a bounded lookahead page with a seeded multi-user workload', async () => {
    const result = await runFeedbackScaling({ users: 30, iterations: 2 })
    expect(result).toMatchObject({
      users: 30,
      feedbackItems: 30,
      votes: 30,
      requestedPageSize: 25,
      returnedRows: 26,
    })
    expect(result.p95Milliseconds).toBeGreaterThanOrEqual(0)
  }, 60000)

  it('rejects unbounded benchmark inputs', async () => {
    await expect(runFeedbackScaling({ users: 0 })).rejects.toThrow(RangeError)
    await expect(runFeedbackScaling({ iterations: 201 })).rejects.toThrow(
      RangeError,
    )
  })
})
