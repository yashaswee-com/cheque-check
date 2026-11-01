import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Disposable in-memory SQL fixture, not a Supabase project or full production schema. */
export async function createScalingFixture(): Promise<PGlite> {
  const db = new PGlite()
  try {
    await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TYPE notification_job_status AS ENUM ('pending','processing','sent','failed','skipped','cancelled');
    CREATE TYPE notification_log_status AS ENUM ('success','failed');
    CREATE TYPE notification_channel AS ENUM ('voice','whatsapp','email','push','sms');
    CREATE TYPE notification_purpose AS ENUM ('cheque_reminder','sample_voice_test');
    CREATE TABLE profiles(user_id uuid PRIMARY KEY, deleted_at timestamptz,
      voice_call_enabled boolean DEFAULT true, phone text DEFAULT '+919800000000',
      time_zone text DEFAULT 'Asia/Kolkata', reminders_per_day int DEFAULT 1);
    CREATE TABLE businesses(id uuid PRIMARY KEY, user_id uuid, deleted_at timestamptz);
    CREATE TABLE parties(id uuid PRIMARY KEY, name text, party_type text);
    CREATE TABLE banks(id uuid PRIMARY KEY,name text);
    CREATE TABLE accounts(id uuid PRIMARY KEY, business_id uuid, bank_id uuid,
      is_draft boolean DEFAULT false, deleted_at timestamptz);
    CREATE TABLE cheques(id uuid PRIMARY KEY, business_id uuid, party_id uuid, account_id uuid,
      cheque_number text, amount numeric, notes text, type text DEFAULT 'Outward',
      status text DEFAULT 'Issued', cheque_date date DEFAULT '2026-10-31',
      deposit_date date, remind_before_days int, is_draft boolean DEFAULT false, deleted_at timestamptz);
    CREATE TABLE user_quotas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      feature_id text, used int DEFAULT 0, "limit" int DEFAULT 5, reset_at timestamptz, updated_at timestamptz);
    CREATE TABLE notification_jobs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, business_id uuid,
      channel notification_channel DEFAULT 'voice', purpose notification_purpose DEFAULT 'cheque_reminder', payload jsonb DEFAULT '{}',
      scheduled_at timestamptz DEFAULT now(), status notification_job_status DEFAULT 'pending',
      attempts int DEFAULT 0, last_error text, idempotency_key text UNIQUE,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE notification_logs(id uuid DEFAULT gen_random_uuid(), job_id uuid, user_id uuid,
      channel notification_channel, purpose notification_purpose, recipient text, status notification_log_status, provider text,
      provider_message_id text, error text);
    CREATE FUNCTION lifecycle_user_active(requested_user uuid DEFAULT auth.uid())
      RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = requested_user AND deleted_at IS NULL) $$;
    -- Unlimited by default; the benchmark sets fixture.free_plan = 'on' to exercise caps.
    CREATE FUNCTION has_lifetime_premium() RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce(current_setting('fixture.free_plan', true), '') <> 'on' $$;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigint, jobname text);
    CREATE FUNCTION cron.alter_job(job_id bigint, schedule text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_businesses ON businesses TO authenticated USING(user_id = auth.uid());
    CREATE POLICY own_cheques ON cheques TO authenticated USING(EXISTS
      (SELECT 1 FROM businesses b WHERE b.id = business_id AND b.user_id = auth.uid()));
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT SELECT ON businesses,cheques,parties,accounts,banks TO authenticated;
    GRANT INSERT ON cheques TO authenticated;
    `)
    for (const migration of [
      '20261031000000_bounded_cheque_reads.sql',
      '20261031010000_notification_delivery_leases.sql',
      '20261031020000_bounded_notification_scheduler.sql',
      '20261031030000_notification_health.sql',
      '20261101110000_free_plan_limits.sql',
      '20261101120000_reminder_times.sql',
      '20261102070000_extended_cheque_filters.sql',
      '20261102090000_cheque_analytics.sql',
    ]) {
      await db.exec(
        readFileSync(
          fileURLToPath(
            new URL(`../../supabase/migrations/${migration}`, import.meta.url),
          ),
          'utf8',
        ),
      )
    }
    await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role')
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}
