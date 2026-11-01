import type { FeedbackCategory } from '@/validators/feedback'

export const FAQ_CATEGORIES = [
  'gettingStarted',
  'chequesScanning',
  'plansPayments',
  'notifications',
  'privacySecurity',
] as const

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export type FaqId =
  | 'create_business'
  | 'manage_businesses'
  | 'add_cheque'
  | 'scan_cheque'
  | 'free_plan'
  | 'plans_payment'
  | 'reminders'
  | 'notification_settings'
  | 'data_privacy'
  | 'secure_account'

export interface FaqEntry {
  id: FaqId
  category: FaqCategory
  related: readonly FaqId[]
}

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: 'create_business',
    category: 'gettingStarted',
    related: ['manage_businesses', 'add_cheque'],
  },
  {
    id: 'manage_businesses',
    category: 'gettingStarted',
    related: ['create_business'],
  },
  {
    id: 'add_cheque',
    category: 'chequesScanning',
    related: ['scan_cheque', 'free_plan'],
  },
  {
    id: 'scan_cheque',
    category: 'chequesScanning',
    related: ['add_cheque'],
  },
  {
    id: 'free_plan',
    category: 'plansPayments',
    related: ['plans_payment', 'add_cheque'],
  },
  {
    id: 'plans_payment',
    category: 'plansPayments',
    related: ['free_plan'],
  },
  {
    id: 'reminders',
    category: 'notifications',
    related: ['notification_settings'],
  },
  {
    id: 'notification_settings',
    category: 'notifications',
    related: ['reminders'],
  },
  {
    id: 'data_privacy',
    category: 'privacySecurity',
    related: ['secure_account'],
  },
  {
    id: 'secure_account',
    category: 'privacySecurity',
    related: ['data_privacy'],
  },
]

export const feedbackCategoryForFaqReport: FeedbackCategory = 'bug'

export function getFaq(id: FaqId) {
  return FAQ_ENTRIES.find((faq) => faq.id === id)
}
