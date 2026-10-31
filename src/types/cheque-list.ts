export type ChequeSortBy = 'date' | 'amount'
export type SortOrder = 'asc' | 'desc'

export interface ChequeListRequest {
  businessId: string
  search?: string
  status?: import('@/types').ChequeStatus
  sortBy?: ChequeSortBy
  sortOrder?: SortOrder
  offset?: number
  limit?: number
  includeInward?: boolean
  nativeFilters?: import('@/features/premium-workspace/types').ChequeFilters
}

export interface ChequePage<T> {
  rows: T[]
  matchingCount: number
  activeCount: number
}

export interface ChequeSummaryRow {
  status: import('@/types').ChequeStatus
  type: import('@/types').ChequeType
  cheque_count: number
  total_amount: number
  today_count: number
  upcoming_count: number
  overdue_count: number
}
