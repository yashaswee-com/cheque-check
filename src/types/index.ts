import type { Database } from './database.types'
export type {
  AccountFormInput,
  AccountFormData,
  BusinessFormData,
  ChequeFormValues,
  PartyFormData,
} from './forms'
type ClosedChoice = Database['public']['Enums']
export type DraftEntity = 'cheque' | 'party' | 'account'
export type ChequeStatus = ClosedChoice['cheque_status']
export type ChequeType = ClosedChoice['cheque_type']
export type IconType = any // For now, to be safe with HugeIcons and Lucide

export interface Profile {
  id: string
  user_id: string
  name: string | null
  email: string | null
  currency: string
  date_format: string
  time_format: string
  time_zone: string
  language: string
  reminders_per_day: number
  default_reminder_days: number
  received_cheques_enabled: boolean
  phone: string | null
  voice_call_enabled: boolean
  sms_enabled: boolean
  party_sms_enabled: boolean
  push_enabled: boolean
  whatsapp_enabled: boolean
  reduce_motion: boolean
  avatar_url?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Business {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
  color?: string
  icon?: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Party {
  id: string
  business_id: string
  name: string
  contact: string
  email: string | null
  address: string | null
  notes: string | null
  color?: string
  icon?: string
  avatar_url?: string | null
  party_type?: PartyType | null
  is_draft?: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type PartyType = ClosedChoice['party_type']

export interface Bank {
  id: string
  name: string
  logo_url: string | null
  created_at: string | null
  updated_at: string | null
  owner_id?: string | null
  deleted_at?: string | null
  category?: ClosedChoice['bank_category'] | null
  source_url?: string | null
  verified_on?: string | null
}

export type TagEntityType = ClosedChoice['tag_entity_type']

export interface Tag {
  id: string
  business_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
  deletion_batch_id?: string | null
}

export interface TagWithUsage extends Tag {
  usage_count: number
}

export interface Account {
  id: string
  business_id: string
  bank_id: string | null
  account_name: string
  account_number: string
  ifsc_code: string | null
  color?: string
  icon?: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
  bank?: Bank
  notes?: string | null
  opening_balance: number
  is_default: boolean
  is_draft?: boolean
}

export interface AccountWithRelations extends Account {
  bank?: Bank
}

export interface Cheque {
  id: string
  business_id: string
  party_id: string
  account_id: string
  cheque_number: string
  /** Pre-existing number that is not six digits; cleared once the number is edited. */
  cheque_number_legacy?: boolean
  amount: number
  cheque_date: string
  deposit_date: string | null
  remind_before_days: number | null
  status: ChequeStatus
  type: ChequeType
  notes: string | null
  image_url: string | null
  is_draft?: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
  deletion_batch_id?: string | null
}

export interface ChequeWithRelations extends Cheque {
  party?: {
    name: string
    contact?: string
    color?: string
    icon?: string
    avatar_url?: string | null
  }
  account?: {
    account_name: string
    color?: string
    icon?: string
    bank?: { name: string; logo_url?: string | null }
  }
}

export type NotificationChannel = ClosedChoice['notification_channel']

export type NotificationJobStatus = ClosedChoice['notification_job_status']
export type NotificationPurpose = ClosedChoice['notification_purpose']

export interface NotificationJob {
  id: string
  user_id: string
  business_id: string | null
  channel: NotificationChannel
  purpose: NotificationPurpose
  payload: Record<string, unknown>
  scheduled_at: string
  status: NotificationJobStatus
  attempts: number
  last_error: string | null
  idempotency_key: string
  created_at: string
  updated_at: string
}

export interface NotificationLog {
  id: string
  job_id: string | null
  user_id: string
  channel: NotificationChannel
  purpose: NotificationPurpose
  recipient: string | null
  status: 'success' | 'failed'
  provider: string
  provider_message_id: string | null
  provider_response: Record<string, unknown> | null
  error: string | null
  created_at: string
}

type DraftBase = {
  id: string
  business_id: string
  is_draft: true
  created_at: string
  updated_at: string
}

export type ChequeDraftFields = {
  party_id: string | null
  account_id: string | null
  cheque_number: string | null
  amount: number | null
  cheque_date: string | null
  deposit_date: string | null
  type: ChequeType | null
  notes: string | null
  image_url: string | null
  remind_before_days?: number | null
}

export type ChequeDraft = DraftBase &
  ChequeDraftFields &
  Pick<ChequeWithRelations, 'party' | 'account'>

export type PartyDraftFields = {
  name: string | null
  contact: string | null
  email: string | null
  address: string | null
  notes: string | null
  color: string | null
  avatar_url: string | null
  party_type?: PartyType | null
}

export type PartyDraft = DraftBase & PartyDraftFields

export type AccountDraftFields = {
  bank_id: string | null
  account_name: string | null
  account_number: string | null
  ifsc_code: string | null
  color: string | null
  notes: string | null
  opening_balance: number | null
  is_default: boolean
}

export type AccountDraft = DraftBase & AccountDraftFields & { bank?: Bank }
