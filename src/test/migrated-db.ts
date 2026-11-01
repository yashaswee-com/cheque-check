import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const directory = join(process.cwd(), 'supabase', 'migrations')
const BASE_CHAIN_END = '20261021060000_scoped_voice_dispatch.sql'
// Later operational migrations (cron, workers, export queues) need extensions PGlite lacks.
const SKIPPED = new Set(['20260805190000_setup_pg_cron_reminders.sql'])

export const migration = (file: string) =>
  readFileSync(join(directory, file), 'utf8')

/**
 * Real PostgreSQL (PGlite) with Supabase auth/storage stubs, the base
 * migration chain, and the given later migrations applied in order.
 */
export async function createMigratedDb(later: string[] = []) {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, phone_change text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,
      file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT string_to_array(name,'/') $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,service_role;
  `)
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql') && name <= BASE_CHAIN_END)
    .sort()
  for (const file of [...files, ...later]) {
    if (SKIPPED.has(file)) continue
    let sql = migration(file)
    if (file === '20261017000000_notification_platform.sql')
      sql = sql.split('-- 8. Replace')[0]
    try {
      await db.exec(sql)
    } catch (error) {
      await db.close()
      throw new Error(`Migration ${file} failed`, { cause: error })
    }
  }
  await db.exec(
    'GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated',
  )
  return db
}

export async function asUser<T>(db: PGlite, user: string, sql: string) {
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false),set_config('request.jwt.claim.role','authenticated',false)`,
  )
  try {
    return await db.query<T>(sql)
  } finally {
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)",
    )
  }
}
