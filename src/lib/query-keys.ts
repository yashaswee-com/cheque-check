/** Central registry of React Query keys. */
export const queryKeys = {
  security: { status: (userId?: string) => ['app-security', userId] as const },
  referrals: {
    summary: (userId?: string) => ['referral-summary', userId] as const,
  },
  announcements: {
    latest: (userId?: string) => ['developer-announcement', userId] as const,
  },
  feedback: {
    mine: (
      userId?: string,
      request?: import('@/validators/feedback').FeedbackPageRequest,
    ) =>
      request
        ? (['feedback-mine', userId, request] as const)
        : (['feedback-mine', userId] as const),
    roadmapAll: () => ['feedback-roadmap'] as const,
    roadmap: (
      userId?: string,
      request?: import('@/validators/feedback').FeedbackPageRequest,
    ) => ['feedback-roadmap', userId, request] as const,
  },
  inbox: {
    all: () => ['notification-inbox'] as const,
    page: (
      userId: string | undefined,
      request: import('@/validators/notification-inbox').InboxRequest,
    ) => ['notification-inbox', userId, 'page', request] as const,
    count: (userId: string | undefined, businessId?: string) =>
      ['notification-inbox', userId, 'count', businessId] as const,
  },
  reportExports: {
    page: (
      businessId: string | undefined,
      request: import('@/validators/export-job').ExportJobPageRequest,
    ) => ['report-exports', businessId, 'page', request] as const,
    list: (businessId: string | undefined) =>
      ['report-exports', businessId] as const,
  },
  accounts: {
    allDetails: () => ['account'] as const,
    list: (businessId: string | undefined) => ['accounts', businessId] as const,
    detail: (id: string | undefined) => ['account', id] as const,
  },
  banks: {
    list: () => ['master-banks'] as const,
  },
  businesses: {
    all: () => ['businesses'] as const,
    detail: (id: string | undefined) => ['business', id] as const,
    allCheques: () => ['all-businesses-cheques'] as const,
    summaries: (today?: string) =>
      today
        ? (['business-cheque-summaries', today] as const)
        : (['business-cheque-summaries'] as const),
  },
  cheques: {
    analyticsAll: () => ['cheque-analytics'] as const,
    analytics: (
      request: import('@/features/cheques/repositories/analytics.repository').AnalyticsRequest,
    ) => ['cheque-analytics', request.businessId, request] as const,
    summaries: (businessId?: string) =>
      ['cheque-summaries', businessId] as const,
    summary: (
      businessId: string | undefined,
      today: string,
      includeInward: boolean,
      range: import('@/features/cheques/lib/date-range').ChequeDateRange,
    ) => ['cheque-summaries', businessId, today, includeInward, range] as const,
    pages: (businessId: string | undefined) =>
      ['cheque-pages', businessId] as const,
    page: (request: import('@/types/cheque-list').ChequeListRequest) =>
      ['cheque-pages', request.businessId, request] as const,
    list: (businessId: string | undefined) => ['cheques', businessId] as const,
    detail: (id: string | undefined) => ['cheque', id] as const,
    numberConflict: (
      businessId: string | undefined,
      accountId: string | undefined,
      chequeNumber: string,
    ) =>
      ['cheque-number-conflict', businessId, accountId, chequeNumber] as const,
  },
  parties: {
    list: (businessId: string | undefined) => ['parties', businessId] as const,
    detail: (id: string | undefined) => ['party', id] as const,
  },
  profile: {
    detail: () => ['profile'] as const,
  },
  monetization: {
    freeUsageAll: () => ['free-usage'] as const,
    freeUsage: (userId?: string) => ['free-usage', userId] as const,
    transactions: () => ['transactions'] as const,
    entitlements: () => ['entitlements'] as const,
    quotas: () => ['quotas'] as const,
  },
  tags: {
    all: () => ['tags'] as const,
    list: (businessId: string | undefined) => ['tags', businessId] as const,
    listWithUsage: (businessId: string | undefined) =>
      ['tags', businessId, 'usage'] as const,
    allDetail: () => ['tag'] as const,
    detail: (id: string | undefined) => ['tag', id] as const,
    links: (id: string | undefined) => ['tag', id, 'links'] as const,
  },
  entityTags: {
    all: () => ['entity-tags'] as const,
    forEntity: (entityType: string, entityId: string | undefined) =>
      ['entity-tags', entityType, entityId] as const,
  },
  entityTagMap: {
    all: () => ['entity-tag-map'] as const,
    forBusiness: (
      businessId: string | null | undefined,
      entityType: string,
      entityIds?: readonly string[],
    ) =>
      entityIds
        ? (['entity-tag-map', businessId, entityType, entityIds] as const)
        : (['entity-tag-map', businessId, entityType] as const),
  },
  drafts: {
    list: (entity: DraftEntity, businessId: string | undefined) =>
      ['drafts', entity, businessId] as const,
    detail: (entity: DraftEntity, id: string | null | undefined) =>
      ['draft', entity, id] as const,
  },
  premiumWorkspace: {
    all: () => ['premium-workspace'] as const,
    context: (businessId: string | undefined) =>
      ['premium-workspace', 'context', businessId] as const,
    tools: (businessId: string | undefined) =>
      ['premium-workspace', 'tools', businessId] as const,
    printLayout: (accountId: string) =>
      ['premium-workspace', 'print-layout', accountId] as const,
  },
}
import type { DraftEntity } from '@/types'
