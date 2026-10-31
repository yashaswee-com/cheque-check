import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chequeDraftService } from '@/features/drafts/services/draft.service'
import { useChequeNumberConflict } from './use-cheque-number-conflict'

vi.mock('@/features/drafts/services/draft.service', () => ({
  chequeDraftService: { hasNumberConflict: vi.fn() },
}))

function setup(
  businessId: string | undefined,
  accountId: string | undefined,
  chequeNumber: string,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => useChequeNumberConflict(businessId, accountId, chequeNumber),
    { wrapper },
  )
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('useChequeNumberConflict', () => {
  it('checks valid six-digit cheque numbers when both owners are selected', async () => {
    vi.mocked(chequeDraftService.hasNumberConflict).mockResolvedValue(true)
    const { result } = setup('business-1', 'account-1', '123456')

    await waitFor(() => expect(result.current.data).toBe(true))

    expect(chequeDraftService.hasNumberConflict).toHaveBeenCalledWith(
      'business-1',
      'account-1',
      '123456',
    )
  })

  it.each([
    [undefined, 'account-1', '123456'],
    ['business-1', undefined, '123456'],
    ['business-1', 'account-1', '12345'],
    ['business-1', 'account-1', '12A456'],
  ] as const)(
    'does not query without a business, account, or valid cheque number',
    (businessId, accountId, chequeNumber) => {
      setup(businessId, accountId, chequeNumber)

      expect(chequeDraftService.hasNumberConflict).not.toHaveBeenCalled()
    },
  )
})
