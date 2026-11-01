import type { Database } from '@/types/database.types'

type PublicTableName = keyof Database['public']['Tables']

// Central table-name registry so `.from(...)` calls get editor autocomplete and
// break at compile time if a migration renames or drops a table.
export const TABLES = {
  APPLICATION_PINS: 'application_pins',
  REPORT_EXPORT_JOBS: 'report_export_jobs',
  PROFILES: 'profiles',
  BUSINESSES: 'businesses',
  PARTIES: 'parties',
  BANKS: 'banks',
  ACCOUNTS: 'accounts',
  CHEQUES: 'cheques',
  USER_ENTITLEMENTS: 'user_entitlements',
  USER_QUOTAS: 'user_quotas',
  TRANSACTIONS: 'transactions',
  PAYMENT_PRODUCTS: 'payment_products',
  API_RATE_LIMITS: 'api_rate_limits',
  NPS_RESPONSES: 'nps_responses',
  TAGS: 'tags',
  ENTITY_TAGS: 'entity_tags',
  NOTIFICATION_JOBS: 'notification_jobs',
  NOTIFICATION_LOGS: 'notification_logs',
  PUSH_SUBSCRIPTIONS: 'push_subscriptions',
  ADMIN_AUDIT_LOG: 'admin_audit_log',
  PREMIUM_WORKSPACE_TOOLS: 'premium_workspace_tools',
} as const satisfies Record<string, PublicTableName>

export type TableName = (typeof TABLES)[keyof typeof TABLES]
