// Hand-authored snapshot of the Supabase schema (supabase/migrations/*.sql).
// Regenerate with `npm run supabase:gen-types` after every new migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      notification_provider_capacity: {
        Row: {
          provider: string
          starts_per_second: number
          max_in_flight: number
          next_start_at: string
          throttled_total: number
          last_throttled_at: string | null
        }
        Insert: Partial<
          Database['public']['Tables']['notification_provider_capacity']['Row']
        > & {
          provider: string
          starts_per_second: number
          max_in_flight: number
        }
        Update: Partial<
          Database['public']['Tables']['notification_provider_capacity']['Row']
        >
        Relationships: []
      }
      notification_provider_slots: {
        Row: { claim_token: string; provider: string; expires_at: string }
        Insert: Database['public']['Tables']['notification_provider_slots']['Row']
        Update: Partial<
          Database['public']['Tables']['notification_provider_slots']['Row']
        >
        Relationships: []
      }
      report_export_rows: {
        Row: { job_id: string; position: number; payload: Json }
        Insert: never
        Update: never
        Relationships: []
      }
      report_export_jobs: {
        Row: {
          id: string
          user_id: string
          business_id: string
          format: 'csv' | 'json'
          include_inward: boolean
          status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired'
          row_count: number
          next_part: number
          part_count: number
          attempts: number
          claim_token: string | null
          lease_until: string | null
          error_code: string | null
          created_at: string
          expires_at: string
          cleaned_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      notification_scheduler_runs: {
        Row: {
          run_at: string
          profile_cursor: string | null
          completed: boolean
          force_run: boolean
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['notification_scheduler_runs']['Row']
        > & { run_at: string }
        Update: Partial<
          Database['public']['Tables']['notification_scheduler_runs']['Row']
        >
        Relationships: []
      }
      notification_attempts: {
        Row: {
          claim_token: string
          job_id: string
          outcome: 'started' | 'accepted' | 'rejected' | 'uncertain'
          provider_message_id: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['notification_attempts']['Row']
        > & {
          claim_token: string
          job_id: string
          outcome: 'started' | 'accepted' | 'rejected' | 'uncertain'
        }
        Update: Partial<
          Database['public']['Tables']['notification_attempts']['Row']
        >
        Relationships: []
      }
      lifecycle_events: {
        Row: {
          id: string
          batch_id: string
          actor_id: string | null
          action: 'delete' | 'restore' | 'deactivate'
          entity_table: string
          entity_id: string
          created_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['lifecycle_events']['Row']
        > & {
          batch_id: string
          action: 'delete' | 'restore' | 'deactivate'
          entity_table: string
          entity_id: string
        }
        Update: Partial<Database['public']['Tables']['lifecycle_events']['Row']>
        Relationships: []
      }
      premium_workspace_print_layouts: {
        Row: {
          deleted_at: string | null
          deletion_batch_id: string | null
          account_id: string
          user_id: string
          layout: Json
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          deletion_batch_id?: string | null
          account_id: string
          user_id: string
          layout: Json
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['premium_workspace_print_layouts']['Row']
        >
        Relationships: []
      }
      premium_workspace_tools: {
        Row: {
          deleted_at: string | null
          deletion_batch_id: string | null
          id: string
          user_id: string
          business_id: string
          kind: Database['public']['Enums']['premium_tool_kind']
          name: string
          payload: Json
          created_at: string
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['premium_workspace_tools']['Row']
        > & {
          user_id: string
          business_id: string
          kind: 'cheque-template' | 'saved-view' | 'message-template'
          name: string
          payload: Json
        }
        Update: Partial<
          Database['public']['Tables']['premium_workspace_tools']['Row']
        >
        Relationships: []
      }
      profiles: {
        Row: {
          deletion_batch_id: string | null
          id: string
          user_id: string
          name: string | null
          email: string | null
          currency: Database['public']['Enums']['profile_currency'] | null
          date_format: Database['public']['Enums']['profile_date_format'] | null
          reminders_per_day: number | null
          default_reminder_days: number | null
          received_cheques_enabled: boolean | null
          time_format: Database['public']['Enums']['profile_time_format'] | null
          time_zone: string | null
          language: Database['public']['Enums']['profile_language'] | null
          avatar_url: string | null
          phone: string | null
          voice_call_enabled: boolean | null
          sms_enabled: boolean
          party_sms_enabled: boolean
          push_enabled: boolean
          whatsapp_enabled: boolean
          reduce_motion: boolean
          deleted_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & {
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      tags: {
        Row: {
          deleted_at: string | null
          deletion_batch_id: string | null
          id: string
          business_id: string
          name: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['tags']['Row']> & {
          business_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['tags']['Row']>
        Relationships: [
          {
            foreignKeyName: 'tags_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      entity_tags: {
        Row: {
          deleted_at: string | null
          deletion_batch_id: string | null
          tag_id: string
          entity_type: Database['public']['Enums']['tag_entity_type']
          entity_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['entity_tags']['Row']> & {
          tag_id: string
          entity_type: Database['public']['Enums']['tag_entity_type']
          entity_id: string
        }
        Update: Partial<Database['public']['Tables']['entity_tags']['Row']>
        Relationships: [
          {
            foreignKeyName: 'entity_tags_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      businesses: {
        Row: {
          deletion_batch_id: string | null
          id: string
          user_id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          logo_url: string | null
          color: string | null
          icon: string | null
          deleted_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['businesses']['Row']> & {
          user_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['businesses']['Row']>
        Relationships: []
      }
      parties: {
        Row: {
          deletion_batch_id: string | null
          id: string
          business_id: string
          name: string | null
          contact: string | null
          email: string | null
          address: string | null
          notes: string | null
          color: string | null
          icon: string | null
          avatar_url: string | null
          party_type: Database['public']['Enums']['party_type'] | null
          is_draft: boolean
          deleted_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['parties']['Row']> & {
          business_id: string
        }
        Update: Partial<Database['public']['Tables']['parties']['Row']>
        Relationships: []
      }
      banks: {
        Row: {
          owner_id: string | null
          deleted_at: string | null
          category: Database['public']['Enums']['bank_category'] | null
          source_url: string | null
          verified_on: string | null
          abbreviation: string | null
          bank_type: Database['public']['Enums']['bank_category'] | null
          country_code: string
          id: string
          name: string
          logo_url: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['banks']['Row']> & {
          name: string
        }
        Update: Partial<Database['public']['Tables']['banks']['Row']>
        Relationships: []
      }
      accounts: {
        Row: {
          deletion_batch_id: string | null
          id: string
          business_id: string
          account_name: string | null
          account_number: string | null
          ifsc_code: string | null
          bank_id: string | null
          color: string | null
          icon: string | null
          notes: string | null
          opening_balance: number
          is_default: boolean
          is_draft: boolean
          deleted_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['accounts']['Row']> & {
          business_id: string
        }
        Update: Partial<Database['public']['Tables']['accounts']['Row']>
        Relationships: [
          {
            foreignKeyName: 'accounts_bank_id_fkey'
            columns: ['bank_id']
            isOneToOne: false
            referencedRelation: 'banks'
            referencedColumns: ['id']
          },
        ]
      }
      cheques: {
        Row: {
          deleted_at: string | null
          deletion_batch_id: string | null
          id: string
          business_id: string
          party_id: string | null
          account_id: string | null
          cheque_number: string | null
          cheque_number_legacy?: boolean
          amount: number | null
          cheque_date: string | null
          deposit_date: string | null
          remind_before_days: number | null
          status: Database['public']['Enums']['cheque_status'] | null
          type: Database['public']['Enums']['cheque_type'] | null
          notes: string | null
          image_url: string | null
          is_draft: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['cheques']['Row']> & {
          business_id: string
        }
        Update: Partial<Database['public']['Tables']['cheques']['Row']>
        Relationships: [
          {
            foreignKeyName: 'cheques_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cheques_party_id_fkey'
            columns: ['party_id']
            isOneToOne: false
            referencedRelation: 'parties'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cheques_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      notification_jobs: {
        Row: {
          id: string
          user_id: string
          business_id: string | null
          channel: Database['public']['Enums']['notification_channel']
          purpose: Database['public']['Enums']['notification_purpose']
          payload: Json
          scheduled_at: string
          status: Database['public']['Enums']['notification_job_status']
          attempts: number
          claim_token: string | null
          lease_until: string | null
          provider_started_at: string | null
          provider_message_id: string | null
          delivery_recipient: string | null
          quota_reserved: boolean
          quota_reset_at: string | null
          last_error: string | null
          idempotency_key: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['notification_jobs']['Row']
        > & {
          user_id: string
          channel: Database['public']['Enums']['notification_channel']
          purpose: Database['public']['Enums']['notification_purpose']
          idempotency_key: string
        }
        Update: Partial<
          Database['public']['Tables']['notification_jobs']['Row']
        >
        Relationships: []
      }
      notification_logs: {
        Row: {
          id: string
          job_id: string | null
          user_id: string
          channel: Database['public']['Enums']['notification_channel']
          purpose: Database['public']['Enums']['notification_purpose']
          recipient: string | null
          status: Database['public']['Enums']['notification_log_status']
          provider: string
          provider_message_id: string | null
          provider_response: Json | null
          error: string | null
          created_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['notification_logs']['Row']
        > & {
          user_id: string
          channel: Database['public']['Enums']['notification_channel']
          purpose: Database['public']['Enums']['notification_purpose']
          status: 'success' | 'failed'
          provider: string
        }
        Update: Partial<
          Database['public']['Tables']['notification_logs']['Row']
        >
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_seen_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['push_subscriptions']['Row']
        > & {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
        }
        Update: Partial<
          Database['public']['Tables']['push_subscriptions']['Row']
        >
        Relationships: []
      }
      user_entitlements: {
        Row: {
          id: string
          user_id: string
          feature_id: Database['public']['Enums']['feature_type']
          status: Database['public']['Enums']['entitlement_status']
          valid_until: string | null
          razorpay_subscription_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<
          Database['public']['Tables']['user_entitlements']['Row']
        > & {
          user_id: string
          feature_id: Database['public']['Enums']['feature_type']
        }
        Update: Partial<
          Database['public']['Tables']['user_entitlements']['Row']
        >
        Relationships: []
      }
      user_quotas: {
        Row: {
          id: string
          user_id: string
          feature_id: Database['public']['Enums']['feature_type']
          used: number
          limit: number
          reset_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['user_quotas']['Row']> & {
          user_id: string
          feature_id: Database['public']['Enums']['feature_type']
        }
        Update: Partial<Database['public']['Tables']['user_quotas']['Row']>
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          amount: number
          currency: string
          status: Database['public']['Enums']['transaction_status']
          type: Database['public']['Enums']['transaction_type']
          feature_id: Database['public']['Enums']['feature_type']
          product_id: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['transactions']['Row']> & {
          user_id: string
          amount: number
          status: Database['public']['Enums']['transaction_status']
          type: Database['public']['Enums']['transaction_type']
          feature_id: Database['public']['Enums']['feature_type']
          product_id: string
        }
        Update: Partial<Database['public']['Tables']['transactions']['Row']>
        Relationships: []
      }
      payment_products: {
        Row: {
          id: string
          name: string
          transaction_type: Database['public']['Enums']['transaction_type']
          feature_id: Database['public']['Enums']['feature_type']
          amount: number
          currency: string
          entitlement_days: number | null
          quota_feature_id: Database['public']['Enums']['feature_type'] | null
          quota_increment: number | null
          required_entitlement_id:
            Database['public']['Enums']['feature_type'] | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['payment_products']['Row']
        > & {
          id: string
          name: string
          transaction_type: Database['public']['Enums']['transaction_type']
          feature_id: Database['public']['Enums']['feature_type']
          amount: number
        }
        Update: Partial<Database['public']['Tables']['payment_products']['Row']>
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          user_id: string
          endpoint: string
          window_started_at: string
          request_count: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['api_rate_limits']['Row']
        > & {
          user_id: string
          endpoint: string
          window_started_at: string
        }
        Update: Partial<Database['public']['Tables']['api_rate_limits']['Row']>
        Relationships: []
      }
      nps_responses: {
        Row: {
          id: string
          user_id: string
          business_id: string | null
          cheque_id: string | null
          score: number
          comment: string | null
          created_at: string
        }
        Insert: Partial<
          Database['public']['Tables']['nps_responses']['Row']
        > & {
          score: number
        }
        Update: Partial<Database['public']['Tables']['nps_responses']['Row']>
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          id: string
          created_at: string
          operator: string
          action: string
          target_user_id: string | null
          target_type: string | null
          target_id: string | null
          reason: string | null
          before: Json | null
          after: Json | null
          metadata: Json
        }
        Insert: Partial<
          Database['public']['Tables']['admin_audit_log']['Row']
        > & {
          operator: string
          action: string
        }
        Update: Partial<Database['public']['Tables']['admin_audit_log']['Row']>
        Relationships: []
      }
    }
    Views: {
      notification_time_zones: {
        Row: { name: string | null }
        Relationships: []
      }
    }
    Functions: {
      admit_notification_delivery: {
        Args: {
          requested_job: string
          requested_token: string
          requested_recipient: string
        }
        Returns: Json
      }
      notification_provider_health: {
        Args: Record<string, never>
        Returns: {
          starts_per_second: number
          max_in_flight: number
          in_flight: number
          expired_slots: number
          next_admission_wait_seconds: number
          throttled_total: number
          last_throttled_at: string | null
        }[]
      }
      claim_report_export: {
        Args: Record<string, never>
        Returns: Database['public']['Tables']['report_export_jobs']['Row'][]
      }
      report_export_batch: {
        Args: { requested_job: string; requested_token: string }
        Returns: Pick<
          Database['public']['Tables']['report_export_rows']['Row'],
          'position' | 'payload'
        >[]
      }
      advance_report_export: {
        Args: {
          requested_job: string
          requested_token: string
          requested_part: number
        }
        Returns: Database['public']['Tables']['report_export_jobs']['Row']
      }
      release_report_export: {
        Args: {
          requested_job: string
          requested_token: string
          requested_failed?: boolean
        }
        Returns: undefined
      }
      expired_report_exports: {
        Args: Record<string, never>
        Returns: Database['public']['Tables']['report_export_jobs']['Row'][]
      }
      clean_report_export: {
        Args: { requested_job: string }
        Returns: undefined
      }
      report_export_access: {
        Args: { requested_path: string }
        Returns: boolean
      }
      request_report_export: {
        Args: {
          requested_id: string
          requested_business: string
          requested_format: string
          requested_include_inward: boolean
        }
        Returns: Database['public']['Tables']['report_export_jobs']['Row']
      }
      cancel_report_export: {
        Args: { requested_job: string }
        Returns: undefined
      }
      report_export_download: {
        Args: { requested_job: string }
        Returns: Database['public']['Tables']['report_export_jobs']['Row']
      }
      notification_health: {
        Args: { requested_window_minutes?: number }
        Returns: {
          pending_due: number
          pending_future: number
          processing: number
          expired_leases: number
          reconciliation_required: number
          oldest_due_age_seconds: number
          sent_in_window: number
          failed_in_window: number
          skipped_in_window: number
          cancelled_in_window: number
          incomplete_scheduler_runs: number
          oldest_scheduler_age_seconds: number
          scheduler_checkpoint_age_seconds: number | null
        }[]
      }
      cheque_summary: {
        Args: {
          requested_business: string
          requested_today: string
          requested_include_inward?: boolean
          requested_from?: string
          requested_to?: string
        }
        Returns: {
          status: Database['public']['Enums']['cheque_status']
          type: Database['public']['Enums']['cheque_type']
          cheque_count: number
          total_amount: number
          today_count: number
          upcoming_count: number
          overdue_count: number
        }[]
      }
      cheque_list_page: {
        Args: {
          requested_business: string
          requested_search?: string
          requested_status?: string
          requested_sort?: string
          requested_order?: string
          requested_offset?: number
          requested_limit?: number
          requested_include_inward?: boolean
          requested_native_search?: string
          requested_native_status?: string
          requested_type?: string
          requested_party?: string
          requested_from?: string
          requested_to?: string
        }
        Returns: {
          cheque_id: string | null
          matching_count: number
          active_count: number
        }[]
      }
      business_cheque_summaries: {
        Args: { requested_today: string }
        Returns: { business_id: string; upcoming_total: number }[]
      }
      schedule_notification_batch: {
        Args: { requested_now?: string; requested_force?: boolean }
        Returns: {
          enqueued: number
          completed: boolean
          invalid_timezones: number
        }[]
      }
      start_notification_delivery: {
        Args: {
          requested_job: string
          requested_token: string
          requested_recipient: string
        }
        Returns: boolean
      }
      finish_notification_delivery: {
        Args: {
          requested_job: string
          requested_token: string
          requested_outcome: string
          requested_provider_id?: string
          requested_error?: string
        }
        Returns: undefined
      }
      release_notification_claim: {
        Args: {
          requested_job: string
          requested_token: string
          requested_error: string
          requested_skip?: boolean
        }
        Returns: undefined
      }
      configure_cron_credentials: {
        Args: {
          requested_project_url: string
          requested_service_role_key: string
        }
        Returns: undefined
      }
      cron_credentials_status: {
        Args: Record<string, never>
        Returns: { project_url: boolean; service_role_key: boolean }[]
      }
      delete_private_bank: {
        Args: { requested_id: string }
        Returns: undefined
      }
      lifecycle_delete: {
        Args: { requested_table: string; requested_id: string }
        Returns: string
      }
      lifecycle_restore: {
        Args: { requested_table: string; requested_id: string }
        Returns: string | null
      }
      lifecycle_deactivate: {
        Args: Record<string, never>
        Returns: string
      }
      lifecycle_user_active: {
        Args: { requested_user?: string }
        Returns: boolean
      }
      lifecycle_business_active: {
        Args: { requested_business: string }
        Returns: boolean
      }
      lifecycle_entity_active: {
        Args: {
          requested_type: string
          requested_id: string
          requested_business: string
        }
        Returns: boolean
      }
      lifecycle_set_tag: {
        Args: {
          requested_tag: string
          requested_type: string
          requested_entity: string
          requested_attached: boolean
        }
        Returns: undefined
      }
      lifecycle_media_active: {
        Args: { requested_bucket: string; requested_path: string }
        Returns: boolean
      }
      duplicate_cheque_draft: {
        Args: { requested_cheque: string }
        Returns: Database['public']['Tables']['cheques']['Row']
      }
      premium_workspace_assert_owner: {
        Args: { requested_business: string }
        Returns: undefined
      }
      premium_workspace_validate_payload: {
        Args: {
          requested_business: string
          requested_kind: string
          requested_payload: Json
        }
        Returns: Json
      }
      has_lifetime_premium: {
        Args: Record<string, never>
        Returns: boolean
      }
      premium_workspace_print_layout: {
        Args: { requested_account: string; requested_layout?: Json }
        Returns: Json
      }
      premium_workspace_save_tool: {
        Args: {
          requested_business: string
          requested_kind: string
          requested_name: string
          requested_payload: Json
          requested_id?: string
        }
        Returns: Database['public']['Tables']['premium_workspace_tools']['Row']
      }
      premium_workspace_apply_tool: {
        Args: { requested_id: string }
        Returns: Json
      }
      premium_workspace_delete_tool: {
        Args: { requested_id: string }
        Returns: undefined
      }
      premium_workspace_message: {
        Args: { requested_business?: string }
        Returns: string | null
      }
      premium_workspace_import: {
        Args: {
          requested_business: string
          requested_kind: string
          requested_rows: Json
        }
        Returns: number
      }
      premium_workspace_bulk_status: {
        Args: {
          requested_business: string
          requested_ids: string[]
          requested_status: Database['public']['Enums']['cheque_status']
        }
        Returns: number
      }
      premium_workspace_snapshot: {
        Args: {
          requested_businesses: string[]
          requested_party?: string
          requested_from?: string
          requested_to?: string
        }
        Returns: Json
      }
      record_payment_order: {
        Args: {
          order_user_id: string
          requested_product_id: string
          razorpay_order: string
        }
        Returns: Database['public']['Tables']['transactions']['Row']
      }
      fulfill_payment_order: {
        Args: {
          razorpay_order: string
          razorpay_payment: string
          order_user_id: string
          requested_product_id: string
          paid_amount: number
          paid_currency: string
        }
        Returns: Database['public']['Tables']['transactions']['Row']
      }
      admin_write_audit: {
        Args: {
          p_operator: string
          p_action: string
          p_target_user_id: string | null
          p_target_type: string | null
          p_target_id: string | null
          p_reason: string | null
          p_before: Json | null
          p_after: Json | null
          p_metadata?: Json
        }
        Returns: string
      }
      admin_set_entitlement: {
        Args: {
          p_user_id: string
          p_feature_id: Database['public']['Enums']['feature_type']
          p_status: Database['public']['Enums']['entitlement_status']
          p_valid_until: string | null
          p_operator: string
          p_action: string
          p_reason?: string | null
          p_record_transaction?: boolean
        }
        Returns: Json
      }
      admin_grant_subscription: {
        Args: {
          p_user_id: string
          p_feature_id: Database['public']['Enums']['feature_type']
          p_days: number
          p_quota: number
          p_operator: string
          p_reason?: string | null
          p_record_transaction?: boolean
        }
        Returns: Json
      }
      admin_topup_quota: {
        Args: {
          p_user_id: string
          p_feature_id: Database['public']['Enums']['feature_type']
          p_amount: number
          p_operator: string
          p_reason?: string | null
          p_record_transaction?: boolean
        }
        Returns: Json
      }
      admin_set_quota: {
        Args: {
          p_user_id: string
          p_feature_id: Database['public']['Enums']['feature_type']
          p_limit: number
          p_used: number
          p_reset_at: string | null
          p_operator: string
          p_reason?: string | null
        }
        Returns: Json
      }
      admin_refund_transaction: {
        Args: {
          p_transaction_id: string
          p_operator: string
          p_reason?: string | null
          p_revoke?: boolean
        }
        Returns: Json
      }
      consume_api_rate_limit: {
        Args: {
          requested_endpoint: string
          request_limit: number
          window_seconds: number
        }
        Returns: boolean
      }
      consume_user_quota: {
        Args: {
          requested_feature: Database['public']['Enums']['feature_type']
        }
        Returns: boolean
      }
      claim_notification_jobs: {
        Args: {
          p_batch_size?: number
          p_job_ids?: string[] | null
          p_user_id?: string | null
        }
        Returns: Database['public']['Tables']['notification_jobs']['Row'][]
      }
      admin_increment_quota: {
        Args: {
          p_user_id: string
          p_feature_id: Database['public']['Enums']['feature_type']
        }
        Returns: boolean
      }
    }
    Enums: {
      bank_category:
        | 'public'
        | 'private'
        | 'small_finance'
        | 'regional_rural'
        | 'foreign'
        | 'urban_cooperative'
        | 'state_cooperative'
        | 'district_cooperative'
        | 'custom'
        | 'payments'
      profile_currency: '₹' | '$' | '€' | '£'
      profile_date_format: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'
      profile_time_format: '12h' | '24h'
      profile_language: 'en' | 'hi' | 'hi-en'
      tag_entity_type: 'cheque' | 'account' | 'party' | 'business'
      party_type: 'customer' | 'supplier' | 'vendor'
      notification_channel: 'voice' | 'whatsapp' | 'email' | 'push' | 'sms'
      notification_job_status:
        'pending' | 'processing' | 'sent' | 'failed' | 'skipped' | 'cancelled'
      notification_log_status: 'success' | 'failed'
      notification_purpose: 'cheque_reminder' | 'sample_voice_test'
      premium_tool_kind: 'cheque-template' | 'saved-view' | 'message-template'
      lifecycle_action: 'delete' | 'restore' | 'deactivate'
      cheque_status: 'Issued' | 'Received' | 'Cleared' | 'Bounced'
      cheque_type: 'Outward' | 'Inward'
      feature_type:
        | 'ai_scan'
        | 'voice_reminder'
        | 'lifetime_premium'
        | 'ai_scanner_sub'
        | 'voice_reminder_sub'
      entitlement_status:
        'active' | 'expired' | 'canceled' | 'trialing' | 'paused'
      transaction_status:
        'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
      transaction_type: 'lifetime' | 'subscription' | 'top_up'
    }
  }
}
