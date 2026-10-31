// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const BUSINESS = '33333333-3333-4333-8333-333333333333'
let db: PGlite

async function asUser<T>(user: string, action: () => Promise<T>): Promise<T> {
  await db.exec(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${user}'; SET request.jwt.claim.role = 'authenticated';`,
  )
  try {
    return await action()
  } finally {
    await db.exec(
      'RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.role;',
    )
  }
}

describe('bank catalog SQL', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.profiles(id uuid DEFAULT gen_random_uuid(), user_id uuid, deleted_at timestamptz);
      CREATE TABLE public.businesses(id uuid PRIMARY KEY, user_id uuid, deleted_at timestamptz);
      CREATE TABLE public.banks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
        logo_url text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Banks are viewable by everyone" ON banks FOR SELECT USING(true);
      CREATE TABLE public.accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid,
        bank_id uuid REFERENCES banks(id), deleted_at timestamptz, is_draft boolean DEFAULT false);
      INSERT INTO auth.users VALUES ('${A}'), ('${B}');
      INSERT INTO profiles(user_id) VALUES ('${A}'), ('${B}');
      INSERT INTO businesses VALUES ('${BUSINESS}', '${A}', null);
      INSERT INTO banks(name) VALUES ('HDFC Bank'), ('Yes Bank'), ('State Bank of India');
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    `)
    await db.exec(
      readFileSync(
        join('supabase', 'migrations', '20261021030000_bank_catalog.sql'),
        'utf8',
      ),
    )
    await db.exec(
      readFileSync(
        join('supabase', 'migrations', '20261021030100_seed_bank_catalog.sql'),
        'utf8',
      ),
    )
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it('seeds all 1934 names idempotently and preserves existing aliases/IDs', async () => {
    const before = await db.query<{ id: string }>(
      "SELECT id FROM banks WHERE name = 'HDFC Bank'",
    )
    await db.exec('SELECT public.seed_reference_banks()')
    const rows = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM banks WHERE owner_id IS NULL',
    )
    expect(rows.rows[0].count).toBe(1934)
    expect(
      (await db.query("SELECT id FROM banks WHERE name = 'HDFC Bank'")).rows,
    ).toEqual(before.rows)
  })

  it('isolates private banks and rejects spoofed ownership/catalog duplicates', async () => {
    await asUser(A, async () => {
      await db.query(
        "INSERT INTO banks(name, owner_id, category) VALUES ('My Private Bank', $1, 'custom')",
        [A],
      )
      await expect(
        db.query(
          "INSERT INTO banks(name, owner_id, category) VALUES ('Spoof Bank', $1, 'custom')",
          [B],
        ),
      ).rejects.toThrow()
      await expect(
        db.query(
          "INSERT INTO banks(name, owner_id, category) VALUES ('HDFC BANK LTD.', $1, 'custom')",
          [A],
        ),
      ).rejects.toThrow('existing shared bank')
    })
    await asUser(B, async () => {
      const rows = await db.query(
        "SELECT id FROM banks WHERE name = 'My Private Bank'",
      )
      expect(rows.rows).toHaveLength(0)
    })
  })

  it('blocks private bank deletion referenced by drafts and rejects cross-owner references', async () => {
    const privateBank = (
      await db.query<{ id: string }>(
        "SELECT id FROM banks WHERE name = 'My Private Bank'",
      )
    ).rows[0].id
    await db.query(
      'INSERT INTO accounts(business_id, bank_id, is_draft) VALUES ($1, $2, true)',
      [BUSINESS, privateBank],
    )
    await asUser(A, async () => {
      await expect(
        db.query('SELECT delete_private_bank($1)', [privateBank]),
      ).rejects.toThrow('referenced')
    })
    await db.query(
      'INSERT INTO banks(name, owner_id, category) VALUES ($1, $2, $3)',
      ['B Private Bank', B, 'custom'],
    )
    const foreign = (
      await db.query<{ id: string }>(
        "SELECT id FROM banks WHERE name = 'B Private Bank'",
      )
    ).rows[0].id
    await expect(
      db.query('INSERT INTO accounts(business_id, bank_id) VALUES ($1, $2)', [
        BUSINESS,
        foreign,
      ]),
    ).rejects.toThrow('available bank')
  })

  it('soft-deletes unreferenced private banks and disallows ordinary DELETE/restore', async () => {
    const target = (
      await db.query<{ id: string }>(
        "SELECT id FROM banks WHERE name = 'B Private Bank'",
      )
    ).rows[0].id
    await asUser(A, async () => {
      await expect(
        db.query('SELECT delete_private_bank($1)', [target]),
      ).rejects.toThrow('not found')
    })
    await asUser(B, async () => {
      await db.query('SELECT delete_private_bank($1)', [target])
      expect(
        (await db.query('SELECT id FROM banks WHERE id = $1', [target])).rows,
      ).toHaveLength(0)
      await expect(
        db.query('DELETE FROM banks WHERE id = $1', [target]),
      ).rejects.toThrow()
      expect(
        (
          await db.query(
            'UPDATE banks SET deleted_at = null WHERE id = $1 RETURNING id',
            [target],
          )
        ).rows,
      ).toHaveLength(0)
    })
    expect(
      (
        await db.query(
          'SELECT id FROM banks WHERE id = $1 AND deleted_at IS NOT NULL',
          [target],
        )
      ).rows,
    ).toHaveLength(1)
  })

  it('denies custom bank creation for deactivated users', async () => {
    await db.query(
      'UPDATE profiles SET deleted_at = now() WHERE user_id = $1',
      [B],
    )
    await asUser(B, async () => {
      await expect(
        db.query(
          "INSERT INTO banks(name, owner_id, category) VALUES ('Inactive Bank', $1, 'custom')",
          [B],
        ),
      ).rejects.toThrow()
    })
  })
})
