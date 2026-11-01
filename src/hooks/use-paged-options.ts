import { useMemo, useState } from 'react'
import { defaultFilter } from 'cmdk'

export const SELECTOR_PAGE_SIZE = 50

export function usePagedOptions<T>(
  options: T[],
  getLabel: (option: T) => string,
) {
  const [query, setQueryState] = useState('')
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => {
    if (!query.trim()) return options
    return options
      .map((option) => ({
        option,
        score: defaultFilter(getLabel(option), query.trim()),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ option }) => option)
  }, [options, getLabel, query])
  const pageCount = Math.ceil(filtered.length / SELECTOR_PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  return {
    query,
    setQuery: (value: string) => {
      setQueryState(value)
      setPage(0)
    },
    options: filtered.slice(
      currentPage * SELECTOR_PAGE_SIZE,
      (currentPage + 1) * SELECTOR_PAGE_SIZE,
    ),
    page: currentPage,
    pageCount,
    previousPage: () => setPage(Math.max(0, currentPage - 1)),
    nextPage: () => setPage(Math.min(pageCount - 1, currentPage + 1)),
  }
}
