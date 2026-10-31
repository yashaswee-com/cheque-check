import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataState } from './data-state'
const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('DataState', () => {
  it('gives loading precedence over authorization and errors', () => {
    render(
      <DataState
        isLoading
        isUnauthorized
        isError
        loadingComponent={<p>Loading</p>}
      >
        Records
      </DataState>,
    )
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.queryByText('notAuthorized')).not.toBeInTheDocument()
  })

  it('offers a dashboard exit from an unauthorized view', () => {
    render(
      <DataState isUnauthorized isError>
        Records
      </DataState>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'backToDashboard' }))
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('offers reload after a data-load error', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    render(<DataState isError>Records</DataState>)
    fireEvent.click(screen.getByRole('button', { name: 'reloadPage' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('distinguishes no records from no filter matches and allows filter reset', () => {
    const clear = vi.fn()
    const { rerender } = render(
      <DataState emptyState={<p>No records</p>}>Records</DataState>,
    )
    expect(screen.getByText('No records')).toBeInTheDocument()
    rerender(
      <DataState allData={[1]} onClearFilters={clear}>
        Records
      </DataState>,
    )
    expect(screen.getByText('noRecordsFound')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clearAllFilters' }))
    expect(clear).toHaveBeenCalledOnce()
    rerender(
      <DataState allData={[1]} data={[1]}>
        Records
      </DataState>,
    )
    expect(screen.getByText('Records')).toBeInTheDocument()
  })

  it.each([
    { isUnauthorized: true, unauthorizedState: <p>Custom</p> },
    { isError: true, errorState: <p>Custom</p> },
    { allData: [1], noResultsState: <p>Custom</p> },
  ])('supports a custom fallback: %j', (props) => {
    render(<DataState {...props}>Records</DataState>)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })
})
