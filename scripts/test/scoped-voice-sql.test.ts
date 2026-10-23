// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Minimal local fixture (in-process PGlite, no network or live services):
// only what the scoped claim reads, then the real migration and assertion script.
const root = process.cwd()
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE public.businesses(id uuid PRIMARY KEY, user_id uuid, deleted_at timestamptz);
    CREATE TYPE public.notification_job_status AS ENUM
      ('pending','processing','sent','failed','skipped','cancelled');
    CREATE TABLE public.notification_jobs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, business_id uuid,
      channel text NOT NULL, purpose text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
      status public.notification_job_status NOT NULL DEFAULT 'pending',
      attempts int NOT NULL DEFAULT 0, last_error text,
      scheduled_at timestamptz NOT NULL DEFAULT now(), idempotency_key text UNIQUE,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE FUNCTION public.lifecycle_user_active(requested_user uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT requested_user IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles WHERE user_id = requested_user AND deleted_at IS NULL) $$;
    CREATE FUNCTION public.claim_notification_jobs(p_batch_size int DEFAULT 50)
    RETURNS SETOF public.notification_jobs LANGUAGE sql AS $$ SELECT * FROM public.notification_jobs WHERE false $$;
    GRANT USAGE ON SCHEMA public, auth TO service_role, authenticated;
  `)
  await db.exec(
    readFileSync(
      join(
        root,
        'supabase',
        'migrations',
        '20261021060000_scoped_voice_dispatch.sql',
      ),
      'utf8',
    ),
  )
})

afterAll(async () => {
  await db.close()
})

describe('scoped voice dispatch claim (PGlite)', () => {
  it('passes the SQL integration assertions', async () => {
    await expect(
      db.exec(
        readFileSync(
          join(root, 'supabase', 'tests', 'scoped_voice_dispatch.sql'),
          'utf8',
        ),
      ),
    ).resolves.toBeDefined()
  })

  it('leaves no fixture rows behind (assertions roll back)', async () => {
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.notification_jobs',
    )
    expect(rows[0].n).toBe(0)
  })

  it('only keeps the scoped signature, granted to service_role only', async () => {
    const { rows } = await db.query<{
      args: string
      anon: boolean
      auth: boolean
      svc: boolean
    }>(`
      SELECT pg_get_function_identity_arguments(p.oid) AS args,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
      FROM pg_proc p WHERE p.proname = 'claim_notification_jobs'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].args).toBe(
      'p_batch_size integer, p_job_ids uuid[], p_user_id uuid',
    )
    expect(rows[0]).toMatchObject({ anon: false, auth: false, svc: true })
  })
})
