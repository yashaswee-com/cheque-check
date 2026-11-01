import { beforeEach, expect, it, vi } from 'vitest'
import { exportJobRepository } from './export-job.repository'
const mocks = vi.hoisted(() => {
  const result = {
    data: [] as unknown[],
    error: null as unknown,
    count: 101 as number | null,
  }
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(resolve(result)),
  }
  return { result, query, from: vi.fn(() => query) }
})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mocks.from }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.result.count = 101
  mocks.result.error = null
  mocks.result.data = []
})
it('bounds and orders server-filtered history and returns the exact total', async () => {
  expect(
    await exportJobRepository.listPage('business', {
      offset: 50,
      limit: 50,
      status: 'failed',
      format: 'csv',
    }),
  ).toEqual({ jobs: [], total: 101 })
  expect(mocks.query.eq).toHaveBeenCalledWith('business_id', 'business')
  expect(mocks.query.eq).toHaveBeenCalledWith('status', 'failed')
  expect(mocks.query.eq).toHaveBeenCalledWith('format', 'csv')
  expect(mocks.query.range).toHaveBeenCalledWith(50, 99)
  expect(mocks.query.select).toHaveBeenCalledWith(expect.any(String), {
    count: 'exact',
  })
  expect(mocks.query.order).toHaveBeenCalledWith('id')
  expect(mocks.query.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
})
it('filters expired jobs by the effective expiration rather than stale stored status', async () => {
  await exportJobRepository.listPage('business', {
    offset: 0,
    limit: 50,
    status: 'expired',
  })
  expect(mocks.query.lte).toHaveBeenCalledWith('expires_at', expect.any(String))
  expect(mocks.query.eq).not.toHaveBeenCalledWith('status', 'expired')
})
it('rejects invalid bounds, missing counts and database failures explicitly', async () => {
  await expect(
    exportJobRepository.listPage('business', { offset: -1, limit: 50 }),
  ).rejects.toThrow('Invalid export job page')
  expect(mocks.from).not.toHaveBeenCalled()
  mocks.result.count = null
  await expect(
    exportJobRepository.listPage('business', { offset: 0, limit: 50 }),
  ).rejects.toThrow('count was not returned')
  mocks.result.error = { code: '42501', message: 'Permission denied' }
  await expect(
    exportJobRepository.listPage('business', { offset: 0, limit: 50 }),
  ).rejects.toThrow('Permission denied')
})
