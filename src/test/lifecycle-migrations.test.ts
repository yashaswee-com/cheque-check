// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const owner = '10000000-0000-0000-0000-000000000001'
const other = '10000000-0000-0000-0000-000000000002'
const business = '20000000-0000-0000-0000-000000000001'
const party = '30000000-0000-0000-0000-000000000001'
const account = '40000000-0000-0000-0000-000000000001'
let db: PGlite

async function asUser<T>(user: string, sql: string) {
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

beforeAll(async () => {
  db = new PGlite()
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
  const directory = join(process.cwd(), 'supabase', 'migrations')
  for (const file of readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith('.sql') &&
        name <= '20261021060000_scoped_voice_dispatch.sql',
    )
    .sort()) {
    // PGlite is real PostgreSQL, with no network/cron extensions. Only operational
    // scheduling is excluded; all table, policy, trigger and RPC migrations run.
    if (file === '20260805190000_setup_pg_cron_reminders.sql') continue
    let sql = readFileSync(join(directory, file), 'utf8')
    if (file === '20261017000000_notification_platform.sql')
      sql = sql.split('-- 8. Replace')[0]
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`Migration ${file} failed`, { cause: error })
    }
  }
  await db.exec(`
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT,INSERT ON storage.objects TO authenticated;
    INSERT INTO auth.users(id,email) VALUES('${owner}','owner@example.test'),('${other}','other@example.test');
    INSERT INTO user_entitlements(user_id,feature_id,status) VALUES('${owner}','lifetime_premium','active')
      ON CONFLICT(user_id,feature_id) DO UPDATE SET status = 'active',valid_until = NULL;
    INSERT INTO businesses(id,user_id,name) VALUES('${business}','${owner}','Test');
    INSERT INTO parties(id,business_id,name,contact) VALUES('${party}','${business}','Party','+919876543210');
    INSERT INTO accounts(id,business_id,account_name,account_number) VALUES('${account}','${business}','Main','123');
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('PostgreSQL lifecycle migrations', () => {
  it('enforces closed sets without silently replacing unknown values', async () => {
    await expect(
      db.exec(`UPDATE profiles SET language = 'xx' WHERE user_id = '${owner}'`),
    ).rejects.toThrow()
    await expect(
      db.exec(`INSERT INTO notification_jobs(user_id,channel,purpose,idempotency_key)
      VALUES('${owner}','voice','unknown','unknown')`),
    ).rejects.toThrow()
  })

  it('rejects direct deletion metadata updates, physical deletion, and cross-tenant writes', async () => {
    await expect(
      asUser(
        owner,
        `UPDATE parties SET deleted_at = now() WHERE id = '${party}'`,
      ),
    ).rejects.toThrow()
    await expect(
      asUser(owner, `DELETE FROM parties WHERE id = '${party}'`),
    ).rejects.toThrow()
    await expect(
      asUser(other, `SELECT lifecycle_delete('parties','${party}')`),
    ).rejects.toThrow()
    await expect(
      asUser(
        other,
        `INSERT INTO cheques(business_id,party_id,is_draft) VALUES('${business}','${party}',true)`,
      ),
    ).rejects.toThrow()
    await expect(
      asUser(owner, `SELECT lifecycle_restore('parties','${party}')`),
    ).rejects.toThrow()
  })

  it('blocks parent deletion for draft and cleared cheque references', async () => {
    await asUser(
      owner,
      `INSERT INTO cheques(business_id,party_id,account_id,is_draft) VALUES('${business}','${party}','${account}',true)`,
    )
    await expect(
      asUser(owner, `SELECT lifecycle_delete('parties','${party}')`),
    ).rejects.toThrow(/reference/)
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM cheques WHERE business_id = '${business}'`,
    )
    await asUser(
      owner,
      `SELECT lifecycle_delete('cheques','${rows.rows[0].id}')`,
    )
    await asUser(
      owner,
      `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,cheque_date,type,status)
      VALUES('${business}','${party}','${account}','111111',10,'2026-10-21','Outward','Cleared')`,
    )
    await expect(
      asUser(owner, `SELECT lifecycle_delete('accounts','${account}')`),
    ).rejects.toThrow(/reference/)
  })

  it('duplicates reminders and only active tags atomically, then preserves links on publication', async () => {
    const source = (
      await db.query<{ id: string }>(
        `SELECT id FROM cheques WHERE cheque_number = '111111'`,
      )
    ).rows[0].id
    await db.exec(
      `UPDATE cheques SET remind_before_days = 7 WHERE id = '${source}'`,
    )
    const tag = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO tags(business_id,name) VALUES('${business}','Duplicate') RETURNING id`,
      )
    ).rows[0].id
    await asUser(
      owner,
      `SELECT lifecycle_set_tag('${tag}','cheque','${source}',true)`,
    )
    const duplicate = (
      await asUser<{
        id: string
        remind_before_days: number
        cheque_number: null
        status: null
      }>(owner, `SELECT * FROM duplicate_cheque_draft('${source}')`)
    ).rows[0]
    expect(duplicate).toMatchObject({
      remind_before_days: 7,
      cheque_number: null,
      status: null,
      is_draft: true,
    })
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM entity_tags WHERE entity_id = '${duplicate.id}'`,
        )
      ).rows,
    ).toHaveLength(1)
    await asUser(
      owner,
      `UPDATE cheques SET cheque_number = '222222',is_draft = false,status = 'Issued' WHERE id = '${duplicate.id}'`,
    )
    await asUser(
      owner,
      `SELECT lifecycle_set_tag('${tag}','cheque','${duplicate.id}',false)`,
    )
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM entity_tags WHERE entity_id = '${source}'`,
        )
      ).rows,
    ).toHaveLength(1)
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM entity_tags WHERE entity_id = '${duplicate.id}'`,
        )
      ).rows,
    ).toHaveLength(0)
    await asUser(
      owner,
      `SELECT lifecycle_set_tag('${tag}','cheque','${duplicate.id}',true)`,
    )
    expect(
      (
        await db.query(
          `SELECT * FROM entity_tags WHERE entity_id = '${duplicate.id}'`,
        )
      ).rows,
    ).toHaveLength(1)
  })

  it('retains earlier independent deletions when restoring a business batch', async () => {
    const independent = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO tags(business_id,name) VALUES('${business}','Old deletion') RETURNING id`,
      )
    ).rows[0].id
    await asUser(owner, `SELECT lifecycle_delete('tags','${independent}')`)
    await asUser(owner, `SELECT lifecycle_delete('businesses','${business}')`)
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM cheques WHERE business_id = '${business}'`,
        )
      ).rows,
    ).toHaveLength(0)
    await db.exec(`SELECT lifecycle_restore('businesses','${business}')`)
    expect(
      (await asUser(owner, `SELECT * FROM tags WHERE id = '${independent}'`))
        .rows,
    ).toHaveLength(0)
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM cheques WHERE business_id = '${business}'`,
        )
      ).rows.length,
    ).toBeGreaterThan(0)
  })

  it('requires fresh Premium access, skips deleted tags, and rolls back a tag-copy failure', async () => {
    const source = (
      await db.query<{ id: string }>(
        `SELECT id FROM cheques WHERE cheque_number = '111111'`,
      )
    ).rows[0].id
    const deletedTag = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO tags(business_id,name) VALUES('${business}','Deleted copy') RETURNING id`,
      )
    ).rows[0].id
    await asUser(
      owner,
      `SELECT lifecycle_set_tag('${deletedTag}','cheque','${source}',true)`,
    )
    await asUser(owner, `SELECT lifecycle_delete('tags','${deletedTag}')`)
    const duplicate = (
      await asUser<{ id: string }>(
        owner,
        `SELECT * FROM duplicate_cheque_draft('${source}')`,
      )
    ).rows[0].id
    expect(
      (
        await db.query(
          `SELECT * FROM entity_tags WHERE entity_id = '${duplicate}' AND tag_id = '${deletedTag}'`,
        )
      ).rows,
    ).toHaveLength(0)
    await db.exec(
      `UPDATE user_entitlements SET status = 'expired' WHERE user_id = '${owner}' AND feature_id = 'lifetime_premium'`,
    )
    await expect(
      asUser(owner, `SELECT duplicate_cheque_draft('${source}')`),
    ).rejects.toThrow(/Premium/)
    await db.exec(
      `UPDATE user_entitlements SET status = 'active' WHERE user_id = '${owner}' AND feature_id = 'lifetime_premium'`,
    )
    const before = (
      await db.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM cheques',
      )
    ).rows[0].count
    await db.exec(`CREATE FUNCTION fail_tag_copy() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity_id <> '${source}'::uuid THEN RAISE EXCEPTION 'Injected tag failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_tag_copy BEFORE INSERT ON entity_tags FOR EACH ROW EXECUTE FUNCTION fail_tag_copy();`)
    await expect(
      asUser(owner, `SELECT duplicate_cheque_draft('${source}')`),
    ).rejects.toThrow(/Injected tag failure/)
    await db.exec(
      'DROP TRIGGER fail_tag_copy ON entity_tags; DROP FUNCTION fail_tag_copy()',
    )
    expect(
      (
        await db.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM cheques',
        )
      ).rows[0].count,
    ).toBe(before)
  })

  it('duplicates a cheque without tags and rejects restoring a child before its parent', async () => {
    const independentParty = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO parties(business_id,name,contact) VALUES('${business}','Independent','+919876543211') RETURNING id`,
      )
    ).rows[0].id
    const source = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO cheques(business_id,party_id,account_id,cheque_number,amount,cheque_date,type,status)
      VALUES('${business}','${independentParty}','${account}','333333',10,'2026-10-21','Outward','Issued') RETURNING id`,
      )
    ).rows[0].id
    const duplicate = (
      await asUser<{ id: string }>(
        owner,
        `SELECT * FROM duplicate_cheque_draft('${source}')`,
      )
    ).rows[0].id
    expect(
      (
        await asUser(
          owner,
          `SELECT * FROM entity_tags WHERE entity_id = '${duplicate}'`,
        )
      ).rows,
    ).toHaveLength(0)
    await asUser(owner, `SELECT lifecycle_delete('cheques','${source}')`)
    await asUser(owner, `SELECT lifecycle_delete('cheques','${duplicate}')`)
    await asUser(
      owner,
      `SELECT lifecycle_delete('parties','${independentParty}')`,
    )
    await expect(
      db.exec(`SELECT lifecycle_restore('cheques','${source}')`),
    ).rejects.toThrow(/Party unavailable/)
    await db.exec(
      `SELECT lifecycle_restore('parties','${independentParty}'); SELECT lifecycle_restore('cheques','${source}')`,
    )
  })

  it('rejects restore uniqueness conflicts without partial recovery', async () => {
    const tag = (
      await asUser<{ id: string }>(
        owner,
        `INSERT INTO tags(business_id,name) VALUES('${business}','Reused') RETURNING id`,
      )
    ).rows[0].id
    await asUser(owner, `SELECT lifecycle_delete('tags','${tag}')`)
    await asUser(
      owner,
      `INSERT INTO tags(business_id,name) VALUES('${business}','Reused')`,
    )
    await expect(
      db.exec(`SELECT lifecycle_restore('tags','${tag}')`),
    ).rejects.toThrow(/conflicts/)
    expect(
      (
        await db.query<{ deleted_at: string }>(
          `SELECT deleted_at FROM tags WHERE id = '${tag}'`,
        )
      ).rows[0].deleted_at,
    ).not.toBeNull()
  })

  it('grants media reads only for active references and immediately denies deactivated JWTs', async () => {
    const media = `/api/storage/private-cheque-images/${owner}/retained.jpg`
    await db.exec(
      `UPDATE cheques SET image_url = '${media}' WHERE cheque_number IN ('111111','222222')`,
    )
    expect(
      (
        await asUser<{ allowed: boolean }>(
          owner,
          `SELECT lifecycle_media_active('private-cheque-images','${owner}/retained.jpg') AS allowed`,
        )
      ).rows[0].allowed,
    ).toBe(true)
    await asUser(
      owner,
      `SELECT lifecycle_delete('cheques',id) FROM cheques WHERE cheque_number = '111111'`,
    )
    expect(
      (
        await asUser<{ allowed: boolean }>(
          owner,
          `SELECT lifecycle_media_active('private-cheque-images','${owner}/retained.jpg') AS allowed`,
        )
      ).rows[0].allowed,
    ).toBe(true)
    await asUser(
      owner,
      `SELECT lifecycle_delete('cheques',id) FROM cheques WHERE cheque_number = '222222'`,
    )
    expect(
      (
        await asUser<{ allowed: boolean }>(
          owner,
          `SELECT lifecycle_media_active('private-cheque-images','${owner}/retained.jpg') AS allowed`,
        )
      ).rows[0].allowed,
    ).toBe(false)
    await asUser(owner, 'SELECT lifecycle_deactivate()')
    expect((await asUser(owner, 'SELECT * FROM businesses')).rows).toHaveLength(
      0,
    )
    await expect(
      asUser(
        owner,
        `INSERT INTO businesses(user_id,name) VALUES('${owner}','Denied')`,
      ),
    ).rejects.toThrow()
    expect(
      (
        await asUser<{ allowed: boolean }>(
          owner,
          'SELECT lifecycle_user_active() AS allowed',
        )
      ).rows[0].allowed,
    ).toBe(false)
  })
})
