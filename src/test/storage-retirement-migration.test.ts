// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    'supabase',
    'migrations',
    '20261019000000_retire_legacy_public_media_buckets.sql',
  ),
  'utf8',
)
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean);
    CREATE TABLE storage.objects(id int PRIMARY KEY, bucket_id text REFERENCES storage.buckets(id));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.protect_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NULL;
    END;
    $$;
    CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets
      FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
    CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects
      FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
  `)
}, 60_000)

beforeEach(async () => {
  await db.exec(`
    TRUNCATE storage.objects, storage.buckets;
    SELECT set_config('storage.allow_delete_query', 'false', false);
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
    DROP POLICY IF EXISTS "Avatar Public Access" ON storage.objects;
    CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (true);
    CREATE POLICY "Avatar Public Access" ON storage.objects FOR SELECT USING (true);
    INSERT INTO storage.buckets VALUES
      ('avatars', true), ('cheque-images', true),
      ('private-avatars', false), ('private-cheque-images', false), ('report-exports', false);
    INSERT INTO storage.objects VALUES (1, 'private-avatars');
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('legacy Storage bucket retirement', () => {
  it('retires only empty legacy buckets with the Supabase deletion guard enabled', async () => {
    await db.exec(migration)
    expect(
      (await db.query('SELECT id FROM storage.buckets ORDER BY id')).rows,
    ).toEqual([
      { id: 'private-avatars' },
      { id: 'private-cheque-images' },
      { id: 'report-exports' },
    ])
    expect((await db.query('SELECT * FROM storage.objects')).rows).toEqual([
      { id: 1, bucket_id: 'private-avatars' },
    ])
    expect(
      (
        await db.query(
          "SELECT policyname FROM pg_policies WHERE schemaname = 'storage'",
        )
      ).rows,
    ).toEqual([])
  })

  it.each(['avatars', 'cheque-images'])(
    'refuses retirement when %s contains objects without changing buckets or policies',
    async (bucket) => {
      await db.query('INSERT INTO storage.objects VALUES (2, $1)', [bucket])
      await expect(db.exec(migration)).rejects.toThrow(
        'Legacy public media buckets are not empty',
      )
      expect(
        (await db.query('SELECT id FROM storage.buckets')).rows,
      ).toHaveLength(5)
      expect(
        (await db.query('SELECT id FROM storage.objects')).rows,
      ).toHaveLength(2)
      expect(
        (
          await db.query(
            "SELECT policyname FROM pg_policies WHERE schemaname = 'storage'",
          )
        ).rows,
      ).toHaveLength(2)
    },
  )

  it('does not leave direct Storage deletion enabled in the surrounding transaction', async () => {
    await db.exec('BEGIN')
    await db.exec(migration)
    const setting = await db.query<{ value: string }>(
      "SELECT current_setting('storage.allow_delete_query', true) AS value",
    )
    expect(setting.rows[0].value).toBe('false')
    await db.exec('COMMIT')
    await expect(
      db.exec("DELETE FROM storage.buckets WHERE id = 'report-exports'"),
    ).rejects.toThrow('Direct deletion from storage tables is not allowed')
    await expect(db.exec('DELETE FROM storage.objects')).rejects.toThrow(
      'Direct deletion from storage tables is not allowed',
    )
  })

  it('preserves an existing caller setting', async () => {
    await db.exec(
      "BEGIN; SELECT set_config('storage.allow_delete_query', 'true', true)",
    )
    await db.exec(migration)
    const setting = await db.query<{ value: string }>(
      "SELECT current_setting('storage.allow_delete_query', true) AS value",
    )
    expect(setting.rows[0].value).toBe('true')
    await db.exec('COMMIT')
  })

  it('can be reapplied after the legacy buckets have been retired', async () => {
    await db.exec(migration)
    await expect(db.exec(migration)).resolves.toBeDefined()
  })
})
