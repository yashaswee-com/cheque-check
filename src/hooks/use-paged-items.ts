'use client'

import { useState } from 'react'

export const CLIENT_PAGE_SIZE = 20

/**
 * Pages an already-filtered client list. Returns to the first page whenever
 * `resetKey` changes (search, filters, sort) and clamps when the list shrinks.
 */
export function usePagedItems<T>(
  items: readonly T[] | undefined,
  resetKey: string,
  pageSize = CLIENT_PAGE_SIZE,
) {
  const [page, setPage] = useState(0)
  const [previousKey, setPreviousKey] = useState(resetKey)
  if (resetKey !== previousKey) {
    setPreviousKey(resetKey)
    setPage(0)
  }
  const total = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, totalPages - 1)
  return {
    items: items?.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    totalPages,
    next: () => setPage(Math.min(current + 1, totalPages - 1)),
    previous: () => setPage(Math.max(0, current - 1)),
  }
}
